import Foundation

/// `generatePassword` from `@repo/crypto`, same character sets and minimums.
enum PasswordGenerator {
  private static let upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  private static let lower = "abcdefghijklmnopqrstuvwxyz"
  private static let digits = "0123456789"
  private static let symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?"
  private static let ambiguous = Set("O0Il1")

  /// Options the app's generator would refuse (no set, minimums over the length) fall back to its defaults.
  static func generate(_ options: GeneratorOptions) -> String {
    var sets: [(chars: [Character], min: Int)] = []
    let strip = { (chars: String) in Array(options.avoidAmbiguous ? chars.filter { !ambiguous.contains($0) } : chars) }
    if options.uppercase { sets.append((strip(upper), 0)) }
    if options.lowercase { sets.append((strip(lower), 0)) }
    if options.digits { sets.append((strip(digits), max(0, options.minDigits))) }
    if options.symbols { sets.append((Array(symbols), max(0, options.minSymbols))) }
    let length = max(1, options.length)
    guard !sets.isEmpty, sets.reduce(0, { $0 + $1.min }) <= length else { return generate(GeneratorOptions()) }

    // SystemRandomNumberGenerator is the system CSPRNG on Apple platforms.
    var chars = sets.flatMap { set in (0..<set.min).map { _ in set.chars.randomElement()! } }
    let all = sets.flatMap(\.chars)
    while chars.count < length { chars.append(all.randomElement()!) }
    return String(chars.shuffled())
  }
}
