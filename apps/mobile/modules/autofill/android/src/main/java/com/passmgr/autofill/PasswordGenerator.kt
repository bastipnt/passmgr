package com.passmgr.autofill

import org.json.JSONObject
import java.security.SecureRandom

/** `PasswordOptions` from `@repo/crypto`: the app's password generator defaults. */
data class GeneratorOptions(
  val length: Int = 16,
  val uppercase: Boolean = true,
  val lowercase: Boolean = true,
  val digits: Boolean = true,
  val symbols: Boolean = true,
  val avoidAmbiguous: Boolean = false,
  val minDigits: Int = 1,
  val minSymbols: Int = 1,
) {
  companion object {
    private val DEFAULTS = GeneratorOptions()

    fun fromJson(json: JSONObject) = GeneratorOptions(
      length = json.optInt("length", DEFAULTS.length),
      uppercase = json.optBoolean("uppercase", DEFAULTS.uppercase),
      lowercase = json.optBoolean("lowercase", DEFAULTS.lowercase),
      digits = json.optBoolean("digits", DEFAULTS.digits),
      symbols = json.optBoolean("symbols", DEFAULTS.symbols),
      avoidAmbiguous = json.optBoolean("avoidAmbiguous", DEFAULTS.avoidAmbiguous),
      minDigits = json.optInt("minDigits", DEFAULTS.minDigits),
      minSymbols = json.optInt("minSymbols", DEFAULTS.minSymbols),
    )
  }

  fun toJson(): JSONObject = JSONObject()
    .put("length", length)
    .put("uppercase", uppercase)
    .put("lowercase", lowercase)
    .put("digits", digits)
    .put("symbols", symbols)
    .put("avoidAmbiguous", avoidAmbiguous)
    .put("minDigits", minDigits)
    .put("minSymbols", minSymbols)
}

/** `generatePassword` from `@repo/crypto`, same character sets and minimums. */
object PasswordGenerator {
  private const val UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
  private const val LOWER = "abcdefghijklmnopqrstuvwxyz"
  private const val DIGITS = "0123456789"
  private const val SYMBOLS = "!@#$%^&*()_+-=[]{}|;:,.<>?"
  private const val AMBIGUOUS = "O0Il1"
  private val random = SecureRandom()

  /** Options the app's generator would refuse (no set, minimums over the length) fall back to its defaults. */
  fun generate(options: GeneratorOptions): String {
    fun strip(chars: String) = if (options.avoidAmbiguous) chars.filterNot { it in AMBIGUOUS } else chars
    val sets = buildList {
      if (options.uppercase) add(strip(UPPER) to 0)
      if (options.lowercase) add(strip(LOWER) to 0)
      if (options.digits) add(strip(DIGITS) to options.minDigits.coerceAtLeast(0))
      if (options.symbols) add(SYMBOLS to options.minSymbols.coerceAtLeast(0))
    }
    val length = options.length.coerceAtLeast(1)
    if (sets.isEmpty() || sets.sumOf { it.second } > length) return generate(GeneratorOptions())

    val chars = sets.flatMap { (set, min) -> List(min) { set[random.nextInt(set.length)] } }.toMutableList()
    val all = sets.joinToString("") { it.first }
    while (chars.size < length) chars += all[random.nextInt(all.length)]
    chars.shuffle(random)
    return chars.joinToString("")
  }
}
