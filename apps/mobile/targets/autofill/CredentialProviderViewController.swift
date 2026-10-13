import AuthenticationServices
import LocalAuthentication
import SwiftUI

final class CredentialProviderViewController: ASCredentialProviderViewController {
  private let model = CredentialListModel()

  override func viewDidLoad() {
    super.viewDidLoad()
    model.onSelect = { [weak self] entry in
      self?.extensionContext.completeRequest(
        withSelectedCredential: ASPasswordCredential(user: entry.username, password: entry.password))
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
  @Published var showsProfiles = false

  var hosts: [String] = []
  /// `profileId/recordId` of a QuickType suggestion: filled without showing the list.
  var requestedRecord: String?
  var onSelect: ((AutofillEntry) -> Void)?
  var onCancel: (() -> Void)?

  private var unlockStarted = false

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
      onSelect?(match.entry)
      return
    }
    all = listed.sorted { $0.entry.title.localizedCaseInsensitiveCompare($1.entry.title) == .orderedAscending }
    suggested = all.filter { listed in hosts.contains { AutofillVault.matches(listed.entry, host: $0) } }
    showsProfiles = profiles.count > 1
    phase = .unlocked
  }
}

struct CredentialListView: View {
  @ObservedObject var model: CredentialListModel
  @State private var query = ""

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
    }
  }

  private func rows(_ entries: [ListedEntry]) -> some View {
    ForEach(entries) { listed in
      Button {
        model.onSelect?(listed.entry)
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
