import AuthenticationServices
import ExpoModulesCore
import LocalAuthentication

public class PassmgrAutofillModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PassmgrAutofill")

    AsyncFunction("isEnabled") { () async -> Bool in
      await ASCredentialIdentityStore.shared.state().isEnabled
    }

    AsyncFunction("openSettings") { () async -> Bool in
      guard #available(iOS 17.0, *) else { return false }
      do {
        try await ASSettingsHelper.openCredentialProviderAppSettings()
        return true
      } catch {
        return false
      }
    }

    AsyncFunction("setEntries") { (profileId: String, payloadJson: String) async throws in
      let payload = Data(payloadJson.utf8)
      let profile = try JSONDecoder().decode(AutofillProfile.self, from: payload)
      try AutofillVault.write(profileId: profileId, payload: payload)
      try await Self.replaceIdentities(profileId: profileId, entries: profile.entries)
    }

    AsyncFunction("clearEntries") { (profileId: String) async throws in
      try AutofillVault.remove(profileId: profileId)
      try await Self.replaceIdentities(profileId: profileId, entries: [])
    }

    AsyncFunction("hasPending") { (profileId: String) throws -> Bool in
      try AutofillVault.hasPending(profileId: profileId)
    }

    AsyncFunction("readPending") { (profileId: String) async throws -> String in
      let context = LAContext()
      try await context.evaluatePolicy(
        .deviceOwnerAuthenticationWithBiometrics, localizedReason: "Save the logins you created in AutoFill")
      let logins = try AutofillVault.readPending(profileId: profileId, context: context)
      return String(decoding: try JSONEncoder().encode(logins), as: UTF8.self)
    }

    AsyncFunction("removePending") { (profileId: String, loginIds: [String]?) throws in
      try AutofillVault.removePending(profileId: profileId, loginIds: loginIds)
    }
  }

  /// The QuickType bar suggestions: username + host per login, no password. The record
  /// identifier (`profileId/recordId`) is what the extension looks the password up by.
  private static func replaceIdentities(profileId: String, entries: [AutofillEntry]) async throws {
    let store = ASCredentialIdentityStore.shared
    guard await store.state().isEnabled else { return }
    let prefix = "\(profileId)/"
    let identities = entries.flatMap { entry in
      entry.hosts.map { host in
        ASPasswordCredentialIdentity(
          serviceIdentifier: ASCredentialServiceIdentifier(identifier: host, type: .domain),
          user: entry.username.isEmpty ? entry.title : entry.username,
          recordIdentifier: prefix + entry.recordId)
      }
    }
    if #available(iOS 17.4, *) {
      // Read through NSArray: iOS 27 returns elements the Swift `[ASCredentialIdentity]` bridge
      // can't cast, and touching one through the typed array traps.
      let listed = await store.credentialIdentities(forService: nil, credentialIdentityTypes: .password) as NSArray
      let stale = listed.compactMap { $0 as? ASPasswordCredentialIdentity }
        .filter { $0.recordIdentifier?.hasPrefix(prefix) == true }
      if !stale.isEmpty { try await store.removeCredentialIdentities(stale) }
      if !identities.isEmpty { try await store.saveCredentialIdentities(identities) }
    } else {
      // No way to list them before iOS 17.4: the last profile written owns the suggestions.
      try await store.replaceCredentialIdentities(with: identities)
    }
  }
}
