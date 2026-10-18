// Shared by the app module and the credential provider extension
// (`targets/autofill/AutofillVault.swift` is a symlink to this file).
//
// The app encrypts each profile's logins to the public half of a P-256 key in the
// Secure Enclave (ECIES, no prompt needed); the private half only works after a
// biometric match on the current enrollment, so only the extension, after Face ID /
// Touch ID, can read them back. Files and key are shared through the app group and
// keychain access group named in both Info.plists.
import AuthenticationServices
import Foundation
import LocalAuthentication
import Security

struct AutofillEntry: Codable {
  let recordId: String
  let title: String
  let username: String
  let password: String
  let hosts: [String]
}

/// `PasswordOptions` from `@repo/crypto`: the app's password generator defaults.
struct GeneratorOptions: Codable {
  var length = 16
  var uppercase = true
  var lowercase = true
  var digits = true
  var symbols = true
  var avoidAmbiguous = false
  var minDigits = 1
  var minSymbols = 1
}

struct AutofillProfile: Codable {
  let profileLabel: String
  let entries: [AutofillEntry]
  let generator: GeneratorOptions?
}

/// A login created in the extension, saved into the vault by the app on its next unlock
/// (`PendingAutofillLogin` in `@repo/store`).
struct PendingLogin: Codable {
  let id: String
  let title: String
  let website: String
  let username: String
  let password: String
  let createdAt: String
}

struct AutofillProfileEntries {
  let profileId: String
  let profile: AutofillProfile
}

enum AutofillVaultError: Error {
  case notConfigured
  case invalidProfileId
  case keyUnavailable
  case keyInvalidated
}

enum AutofillVault {
  private static let keyTag = Data("passmgr.autofill.key".utf8)
  private static let domainStateKey = "passmgr.autofill.domain-state"
  private static let algorithm = SecKeyAlgorithm.eciesEncryptionCofactorVariableIVX963SHA256AESGCM
  private static let fileExtension = "autofill"
  private static let pendingExtension = "pending"

  private static func infoString(_ key: String) throws -> String {
    guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String, !value.isEmpty
    else { throw AutofillVaultError.notConfigured }
    return value
  }

  private static func keychainGroup() throws -> String {
    try infoString("PassmgrKeychainGroup")
  }

  private static func defaults() throws -> UserDefaults {
    guard let defaults = UserDefaults(suiteName: try infoString("PassmgrAppGroup"))
    else { throw AutofillVaultError.notConfigured }
    return defaults
  }

  private static func directory() throws -> URL {
    guard
      let container = FileManager.default.containerURL(
        forSecurityApplicationGroupIdentifier: try infoString("PassmgrAppGroup"))
    else { throw AutofillVaultError.notConfigured }
    var dir = container.appendingPathComponent("Library/Application Support/Autofill", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try dir.setResourceValues(values)
    return dir
  }

  // Profile and login ids are UUIDs; anything else must not become a path.
  private static func validId(_ id: String) throws -> String {
    guard UUID(uuidString: id) != nil else { throw AutofillVaultError.invalidProfileId }
    return id.lowercased()
  }

  private static func file(for profileId: String) throws -> URL {
    try directory().appendingPathComponent("\(try validId(profileId)).\(fileExtension)")
  }

  /// `<profileId>.<loginId>.pending`: the profile is readable without the key.
  private static func pendingFile(profileId: String, loginId: String) throws -> URL {
    try directory().appendingPathComponent("\(try validId(profileId)).\(try validId(loginId)).\(pendingExtension)")
  }

  private static func pendingFiles(profileId: String) throws -> [URL] {
    let prefix = "\(try validId(profileId))."
    return try FileManager.default.contentsOfDirectory(at: try directory(), includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == pendingExtension && $0.lastPathComponent.hasPrefix(prefix) }
  }

  private static func seal(_ payload: Data, to publicKey: SecKey, at url: URL) throws {
    var error: Unmanaged<CFError>?
    guard let sealed = SecKeyCreateEncryptedData(publicKey, algorithm, payload as CFData, &error) else {
      throw error!.takeRetainedValue() as Error
    }
    try (sealed as Data).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  private static func open(_ url: URL, with key: SecKey) -> Data? {
    guard let sealed = try? Data(contentsOf: url) else { return nil }
    return SecKeyCreateDecryptedData(key, algorithm, sealed as CFData, nil) as Data?
  }

  // MARK: App

  static func write(profileId: String, payload: Data) throws {
    try seal(payload, to: try currentPublicKey(), at: try file(for: profileId))
  }

  static func remove(profileId: String) throws {
    let url = try file(for: profileId)
    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
  }

  /// The key's public half. A changed biometric enrollment leaves the private half unusable,
  /// so then the key and every profile's file are replaced (the other profiles write theirs
  /// again on their next unlock).
  private static func currentPublicKey() throws -> SecKey {
    let defaults = try defaults()
    let domainState = biometricDomainState()
    if let key = try findPrivateKey(context: nil),
      domainState == nil || defaults.data(forKey: domainStateKey) == domainState
    {
      if let publicKey = SecKeyCopyPublicKey(key) { return publicKey }
    }
    try removeAll()
    let key = try createPrivateKey()
    defaults.set(domainState, forKey: domainStateKey)
    guard let publicKey = SecKeyCopyPublicKey(key) else { throw AutofillVaultError.keyUnavailable }
    return publicKey
  }

  private static func biometricDomainState() -> Data? {
    let context = LAContext()
    guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else { return nil }
    return context.evaluatedPolicyDomainState
  }

  private static func createPrivateKey() throws -> SecKey {
    if let key = try? createPrivateKey(secureEnclave: true) { return key }
    // The simulator and devices without a Secure Enclave: a keychain key with the same access control.
    return try createPrivateKey(secureEnclave: false)
  }

  private static func createPrivateKey(secureEnclave: Bool) throws -> SecKey {
    var error: Unmanaged<CFError>?
    let flags: SecAccessControlCreateFlags =
      secureEnclave ? [.privateKeyUsage, .biometryCurrentSet] : [.biometryCurrentSet]
    guard
      let access = SecAccessControlCreateWithFlags(
        nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, flags, &error)
    else { throw error!.takeRetainedValue() as Error }
    var attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrKeySizeInBits as String: 256,
      kSecAttrAccessGroup as String: try keychainGroup(),
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: keyTag,
        kSecAttrAccessControl as String: access,
      ],
    ]
    if secureEnclave { attributes[kSecAttrTokenID as String] = kSecAttrTokenIDSecureEnclave }
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
      throw error!.takeRetainedValue() as Error
    }
    return key
  }

  private static func findPrivateKey(context: LAContext?) throws -> SecKey? {
    var query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
      kSecAttrApplicationTag as String: keyTag,
      kSecAttrAccessGroup as String: try keychainGroup(),
      kSecReturnRef as String: true,
    ]
    if let context { query[kSecUseAuthenticationContext as String] = context }
    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess, let item else { return nil }
    return (item as! SecKey)
  }

  static func hasPending(profileId: String) throws -> Bool {
    try !pendingFiles(profileId: profileId).isEmpty
  }

  /// `context` must already have passed the biometric check. A file that doesn't open never
  /// will (another key, half written): it's deleted, or it would ask again on every unlock.
  static func readPending(profileId: String, context: LAContext) throws -> [PendingLogin] {
    guard let key = try findPrivateKey(context: context) else { throw AutofillVaultError.keyUnavailable }
    return try pendingFiles(profileId: profileId).compactMap { url in
      if let login = open(url, with: key).flatMap({ try? JSONDecoder().decode(PendingLogin.self, from: $0) }) {
        return login
      }
      try? FileManager.default.removeItem(at: url)
      return nil
    }
  }

  /// `loginIds` nil: every one of the profile.
  static func removePending(profileId: String, loginIds: [String]?) throws {
    let urls =
      try loginIds?.map { try pendingFile(profileId: profileId, loginId: $0) }
      ?? pendingFiles(profileId: profileId)
    for url in urls where FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.removeItem(at: url)
    }
  }

  /// Drops the key and every profile's file: written again by the app on its next unlock. Logins
  /// created in the extension and not saved yet go too: nothing could open them any more.
  static func removeAll() throws {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: keyTag,
      kSecAttrAccessGroup as String: try keychainGroup(),
    ]
    SecItemDelete(query as CFDictionary)
    let dir = try directory()
    for url in try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    where url.pathExtension == fileExtension || url.pathExtension == pendingExtension {
      try FileManager.default.removeItem(at: url)
    }
  }

  // MARK: Extension

  static func hasEntries() -> Bool {
    guard let dir = try? directory(),
      let urls = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    else { return false }
    return urls.contains { $0.pathExtension == fileExtension }
  }

  /// Every profile's logins. `context` must already have passed the biometric check. A file
  /// that can't be read is left out; only when none can is the key taken as invalidated.
  static func readAll(context: LAContext) throws -> [AutofillProfileEntries] {
    guard let key = try findPrivateKey(context: context) else { throw AutofillVaultError.keyUnavailable }
    let dir = try directory()
    let urls = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
      .filter { $0.pathExtension == fileExtension }
    let profiles = urls.compactMap { url -> AutofillProfileEntries? in
      guard let payload = open(url, with: key),
        let profile = try? JSONDecoder().decode(AutofillProfile.self, from: payload)
      else { return nil }
      return AutofillProfileEntries(profileId: url.deletingPathExtension().lastPathComponent, profile: profile)
    }
    if profiles.isEmpty && !urls.isEmpty { throw AutofillVaultError.keyInvalidated }
    return profiles
  }

  /// Encrypting needs only the public half: no prompt. The existing key only, unlike the app's
  /// `currentPublicKey`: a new one would make every profile's file unreadable. `context` is the
  /// one `readAll` just opened the files with, so the key is still the current enrollment's: a
  /// dead one would make the app drop the login unread.
  static func writePending(profileId: String, login: PendingLogin, context: LAContext) throws {
    guard let key = try findPrivateKey(context: context), let publicKey = SecKeyCopyPublicKey(key) else {
      throw AutofillVaultError.keyUnavailable
    }
    let url = try pendingFile(profileId: profileId, loginId: login.id)
    try seal(try JSONEncoder().encode(login), to: publicKey, at: url)
  }

  // MARK: Matching

  /// A service's host as `websiteHost` (`@repo/util`) writes it: lowercase, no `www.`.
  static func host(of service: ASCredentialServiceIdentifier) -> String {
    let raw = service.identifier
    let host =
      service.type == .URL
      ? (URL(string: raw)?.host ?? raw)
      : (URL(string: "https://\(raw)")?.host ?? raw)
    let lower = host.lowercased()
    return lower.hasPrefix("www.") ? String(lower.dropFirst(4)) : lower
  }

  static func matches(_ entry: AutofillEntry, host: String) -> Bool {
    entry.hosts.contains { host == $0 || host.hasSuffix(".\($0)") }
  }
}
