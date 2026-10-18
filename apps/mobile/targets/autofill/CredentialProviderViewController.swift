import AuthenticationServices
import LocalAuthentication
import SwiftUI

final class CredentialProviderViewController: ASCredentialProviderViewController {
  private let model = CredentialListModel()

  override func viewDidLoad() {
    super.viewDidLoad()
    // The form's own field must give up the keyboard first: completing while it holds it leaves
    // the host app frozen, and the text isn't inserted.
    model.onSelect = { [weak self] username, password in
      self?.view.endEditing(true)
      self?.extensionContext.completeRequest(
        withSelectedCredential: ASPasswordCredential(user: username, password: password))
    }
    model.onInsertText = { [weak self] text in
      guard #available(iOS 18.0, *) else { return }
      self?.view.endEditing(true)
      self?.extensionContext.completeRequest(withTextToInsert: text) { expired in
        if expired { NSLog("Passmgr: text insertion expired") }
      }
    }
    model.onCancel = { [weak self] in
      self?.extensionContext.cancelRequest(
        withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userCanceled.rawValue))
    }
    let host = UIHostingController(rootView: CredentialListView(model: model))
    addChild(host)
    host.view.frame = view.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(host.view)
    host.didMove(toParent: self)
  }

  // Face ID refuses to prompt before the extension's view is on screen ("Caller is not running
  // foreground"), so the `prepare…` calls only say what to fill and the unlock starts here.
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    model.unlock()
  }

  override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
    model.hosts = serviceIdentifiers.map(AutofillVault.host(of:))
  }

  // Every password needs Face ID / Touch ID first: there is nothing to hand out silently.
  override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
    extensionContext.cancelRequest(
      withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userInteractionRequired.rawValue))
  }

  @available(iOS 17.0, *)
  override func provideCredentialWithoutUserInteraction(for credentialRequest: ASCredentialRequest) {
    extensionContext.cancelRequest(
      withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userInteractionRequired.rawValue))
  }

  override func prepareInterfaceToProvideCredential(for credentialIdentity: ASPasswordCredentialIdentity) {
    provide(credentialIdentity)
  }

  @available(iOS 17.0, *)
  override func prepareInterfaceToProvideCredential(for credentialRequest: ASCredentialRequest) {
    guard let identity = credentialRequest.credentialIdentity as? ASPasswordCredentialIdentity else {
      model.onCancel?()
      return
    }
    provide(identity)
  }

  // The AutoFill context menu of any text field: insert a username or password as text.
  @available(iOS 18.0, *)
  override func prepareInterfaceForUserChoosingTextToInsert() {
    model.insertsText = true
  }

  private func provide(_ identity: ASPasswordCredentialIdentity) {
    model.hosts = [AutofillVault.host(of: identity.serviceIdentifier)]
    model.requestedRecord = identity.recordIdentifier
  }
}

struct ListedEntry: Identifiable {
  let id: String
  let profileLabel: String
  let entry: AutofillEntry
}

struct ProfileOption: Identifiable {
  let id: String
  let label: String
  let generator: GeneratorOptions
}

@MainActor
final class CredentialListModel: ObservableObject {
  enum Phase {
    case locked
    case failed(String)
    case unlocked
  }

  @Published var phase: Phase = .locked
  @Published var suggested: [ListedEntry] = []
  @Published var all: [ListedEntry] = []
  @Published var profiles: [ProfileOption] = []
  @Published var insertsText = false

  var showsProfiles: Bool { profiles.count > 1 }
  var hosts: [String] = []
  /// `profileId/recordId` of a QuickType suggestion: filled without showing the list.
  var requestedRecord: String?
  var onSelect: ((_ username: String, _ password: String) -> Void)?
  var onInsertText: ((String) -> Void)?
  var onCancel: (() -> Void)?

  private var unlockStarted = false
  private var context: LAContext?

  func unlock() {
    guard !unlockStarted else { return }
    unlockStarted = true
    guard AutofillVault.hasEntries() else {
      phase = .failed("Open Passmgr and unlock it once to use AutoFill.")
      return
    }
    let context = LAContext()
    context.localizedCancelTitle = "Cancel"
    context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Fill a password")
    { success, _ in
      Task { @MainActor in
        guard success else {
          self.onCancel?()
          return
        }
        self.load(context: context)
      }
    }
  }

  private func load(context: LAContext) {
    let profiles: [AutofillProfileEntries]
    do {
      profiles = try AutofillVault.readAll(context: context)
      self.context = context
    } catch {
      phase = .failed("AutoFill needs setting up again: open Passmgr and unlock it.")
      return
    }
    let listed = profiles.flatMap { item in
      item.profile.entries.map {
        ListedEntry(id: "\(item.profileId)/\($0.recordId)", profileLabel: item.profile.profileLabel, entry: $0)
      }
    }
    if let requestedRecord, let match = listed.first(where: { $0.id == requestedRecord }) {
      onSelect?(match.entry.username, match.entry.password)
      return
    }
    all = listed.sorted { $0.entry.title.localizedCaseInsensitiveCompare($1.entry.title) == .orderedAscending }
    suggested = all.filter { listed in hosts.contains { AutofillVault.matches(listed.entry, host: $0) } }
    self.profiles = profiles
      .map { ProfileOption(id: $0.profileId, label: $0.profile.profileLabel, generator: $0.profile.generator ?? GeneratorOptions()) }
      .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    phase = .unlocked
  }

  /// Fills the form now (from the context menu: only the password, into the focused field);
  /// the app saves the login into the profile on its next unlock.
  func createLogin(profileId: String, title: String, website: String, username: String, password: String) throws {
    let site = website.trimmingCharacters(in: .whitespaces)
    let login = PendingLogin(
      id: UUID().uuidString.lowercased(),
      title: title.trimmingCharacters(in: .whitespaces).isEmpty ? site : title,
      website: site.isEmpty || site.contains("://") ? site : "https://\(site)",
      username: username,
      password: password,
      createdAt: ISO8601DateFormatter().string(from: Date()))
    guard let context else { throw AutofillVaultError.keyUnavailable }
    try AutofillVault.writePending(profileId: profileId, login: login, context: context)
    if insertsText {
      onInsertText?(password)
    } else {
      onSelect?(username, password)
    }
  }
}

struct CredentialListView: View {
  @ObservedObject var model: CredentialListModel
  @State private var query = ""
  @State private var creating = false
  @State private var inserting: AutofillEntry?

  private var filtered: [ListedEntry] {
    guard !query.isEmpty else { return model.all }
    return model.all.filter {
      $0.entry.title.localizedCaseInsensitiveContains(query)
        || $0.entry.username.localizedCaseInsensitiveContains(query)
        || $0.entry.hosts.contains { $0.localizedCaseInsensitiveContains(query) }
    }
  }

  var body: some View {
    NavigationStack {
      content
        .navigationTitle("Passmgr")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { model.onCancel?() }
          }
        }
    }
  }

  @ViewBuilder private var content: some View {
    switch model.phase {
    case .locked:
      ProgressView()
    case .failed(let message):
      Text(message)
        .multilineTextAlignment(.center)
        .foregroundStyle(.secondary)
        .padding()
    case .unlocked:
      List {
        if query.isEmpty && !model.suggested.isEmpty {
          Section("Suggestions") { rows(model.suggested) }
        }
        Section(query.isEmpty ? "All logins" : "Results") { rows(filtered) }
      }
      .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always))
      .safeAreaInset(edge: .bottom) {
        Button {
          creating = true
        } label: {
          Text(model.hosts.first.map { "Create login for \($0)" } ?? "Create login")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .padding()
      }
      .navigationDestination(isPresented: $creating) { CreateLoginView(model: model) }
      .confirmationDialog(
        inserting?.title ?? "", isPresented: Binding(get: { inserting != nil }, set: { if !$0 { inserting = nil } }),
        presenting: inserting
      ) { entry in
        if !entry.username.isEmpty {
          Button("Insert username") { model.onInsertText?(entry.username) }
        }
        Button("Insert password") { model.onInsertText?(entry.password) }
      }
    }
  }

  private func rows(_ entries: [ListedEntry]) -> some View {
    ForEach(entries) { listed in
      Button {
        if model.insertsText {
          inserting = listed.entry
        } else {
          model.onSelect?(listed.entry.username, listed.entry.password)
        }
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          Text(listed.entry.title).foregroundStyle(.primary)
          Text(subtitle(listed)).font(.footnote).foregroundStyle(.secondary)
        }
      }
    }
  }

  private func subtitle(_ listed: ListedEntry) -> String {
    let parts = [listed.entry.username, model.showsProfiles ? listed.profileLabel : ""].filter { !$0.isEmpty }
    return parts.joined(separator: " · ")
  }
}

struct CreateLoginView: View {
  @ObservedObject var model: CredentialListModel
  @State private var title: String
  @State private var website: String
  @State private var username = ""
  @State private var password: String
  @State private var profileId: String
  @State private var failed = false

  init(model: CredentialListModel) {
    self.model = model
    let profile = model.profiles.first
    _title = State(initialValue: model.hosts.first ?? "")
    _website = State(initialValue: model.hosts.first ?? "")
    _profileId = State(initialValue: profile?.id ?? "")
    _password = State(initialValue: PasswordGenerator.generate(profile?.generator ?? GeneratorOptions()))
  }

  var body: some View {
    Form {
      Section {
        TextField("Title", text: $title)
        // The context menu doesn't say which site it's on.
        if model.hosts.isEmpty {
          TextField("Website", text: $website)
            .textContentType(.URL)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        }
        TextField("Username or email", text: $username)
          .textContentType(.username)
          .keyboardType(.emailAddress)
          .textInputAutocapitalization(.never)
          .autocorrectionDisabled()
      }
      Section {
        HStack {
          Text(password)
            .font(.system(.body, design: .monospaced))
            .textSelection(.enabled)
          Spacer()
          Button {
            password = PasswordGenerator.generate(
              model.profiles.first { $0.id == profileId }?.generator ?? GeneratorOptions())
          } label: {
            Image(systemName: "arrow.clockwise")
          }
          .accessibilityLabel("New password")
        }
      } header: {
        Text("Password")
      } footer: {
        Text(
          model.insertsText
            ? "Inserts the password. Passmgr saves the login to your vault the next time you open it."
            : "Passmgr saves the login to your vault the next time you open it.")
      }
      if model.showsProfiles {
        Section {
          Picker("Save to", selection: $profileId) {
            ForEach(model.profiles) { Text($0.label).tag($0.id) }
          }
        }
      }
    }
    .navigationTitle("New login")
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(model.insertsText ? "Create & Insert" : "Create & AutoFill") {
          do {
            try model.createLogin(
              profileId: profileId, title: title, website: website, username: username, password: password)
          } catch {
            NSLog("Passmgr: pending login not saved: %@", String(describing: error))
            failed = true
          }
        }
        .disabled(profileId.isEmpty)
      }
    }
    .alert("The login couldn't be saved", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("Open Passmgr and unlock it to set up AutoFill again.")
    }
  }
}
