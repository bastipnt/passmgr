package com.passmgr.autofill

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.UserNotAuthenticatedException
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.SecureRandom
import java.security.spec.MGF1ParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.OAEPParameterSpec
import javax.crypto.spec.PSource
import javax.crypto.spec.SecretKeySpec

data class AutofillEntry(
  val recordId: String,
  val title: String,
  val username: String,
  val password: String,
  val hosts: List<String>,
)

data class AutofillProfile(
  val profileId: String,
  val profileLabel: String,
  val entries: List<AutofillEntry>,
  val generator: GeneratorOptions,
)

/** A login created in autofill, saved into the vault by the app on its next unlock (`PendingAutofillLogin`). */
data class PendingLogin(
  val id: String,
  val title: String,
  val website: String,
  val username: String,
  val password: String,
  val createdAt: String,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("title", title)
    .put("website", website)
    .put("username", username)
    .put("password", password)
    .put("createdAt", createdAt)

  companion object {
    fun fromJson(json: JSONObject) = PendingLogin(
      id = json.getString("id"),
      title = json.getString("title"),
      website = json.getString("website"),
      username = json.getString("username"),
      password = json.getString("password"),
      createdAt = json.getString("createdAt"),
    )
  }
}

class AutofillKeyInvalidatedException : Exception()

/**
 * Each profile's logins, encrypted to an RSA key in the Android Keystore: a fresh
 * AES-GCM key per write, wrapped with the public half (no prompt needed). The
 * private half only works for a short while after a strong biometric match and
 * dies with a new enrollment, so only `AutofillAuthActivity` reads them back.
 * Files live in `noBackupFilesDir`: the key never leaves the device, a backup of
 * them would be unreadable anyway.
 */
object AutofillVault {
  private const val KEY_ALIAS = "passmgr.autofill.key"
  private const val FORMAT_VERSION = 1
  private const val AUTH_SECONDS = 15
  private const val RSA_TRANSFORMATION = "RSA/ECB/OAEPWithSHA-256AndMGF1Padding"
  // The Keystore only does OAEP with MGF1 over SHA-1, whatever the main digest.
  private val oaep = OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA1, PSource.PSpecified.DEFAULT)

  private fun directory(context: Context) = File(context.noBackupFilesDir, "passmgr-autofill").apply { mkdirs() }

  // Profile and login ids are UUIDs; anything else must not become a path.
  private fun validId(id: String) = UUID.fromString(id).toString().also { require(it == id.lowercase()) }

  private fun file(context: Context, profileId: String) = File(directory(context), "${validId(profileId)}.autofill")

  private fun files(context: Context) =
    directory(context).listFiles { file -> file.name.endsWith(".autofill") }.orEmpty().toList()

  /** `<profileId>.<loginId>.pending`: the profile is readable without the key. */
  private fun pendingFile(context: Context, profileId: String, loginId: String) =
    File(directory(context), "${validId(profileId)}.${validId(loginId)}.pending")

  private fun pendingFiles(context: Context, profileId: String): List<File> {
    val prefix = "${validId(profileId)}."
    return directory(context)
      .listFiles { file -> file.name.startsWith(prefix) && file.name.endsWith(".pending") }
      .orEmpty()
      .toList()
  }

  /** Profiles with a file, by id: known without the key. */
  fun profileIds(context: Context) = files(context).map { it.nameWithoutExtension }

  private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  fun hasEntries(context: Context) = files(context).isNotEmpty()

  // App

  fun write(context: Context, profileId: String, payload: String) {
    seal(publicKey(context), payload, file(context, profileId))
  }

  private fun seal(publicKey: PublicKey, payload: String, target: File) {
    val dataKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    val wrapped = Cipher.getInstance(RSA_TRANSFORMATION).run {
      init(Cipher.ENCRYPT_MODE, publicKey, oaep)
      doFinal(dataKey.encoded)
    }
    val iv = ByteArray(12).also { SecureRandom().nextBytes(it) }
    val sealed = Cipher.getInstance("AES/GCM/NoPadding").run {
      init(Cipher.ENCRYPT_MODE, dataKey, GCMParameterSpec(128, iv))
      doFinal(payload.toByteArray(Charsets.UTF_8))
    }
    val bytes = ByteArrayOutputStream().also { out ->
      DataOutputStream(out).use {
        it.writeByte(FORMAT_VERSION)
        it.writeShort(wrapped.size)
        it.write(wrapped)
        it.write(iv)
        it.write(sealed)
      }
    }.toByteArray()
    val temp = File.createTempFile(target.name, ".tmp", target.parentFile)
    temp.writeBytes(bytes)
    if (!temp.renameTo(target)) {
      temp.delete()
      throw IllegalStateException("Could not save the autofill entries")
    }
  }

  fun remove(context: Context, profileId: String) {
    file(context, profileId).delete()
  }

  fun hasPending(context: Context, profileId: String) = pendingFiles(context, profileId).isNotEmpty()

  /**
   * Right after the biometric prompt. A file that doesn't open never will (half written, another
   * format): it's deleted, or it would ask again on every unlock.
   */
  fun readPending(context: Context, profileId: String): List<PendingLogin> {
    val privateKey = keyStore().getKey(KEY_ALIAS, null) as? PrivateKey ?: throw AutofillKeyInvalidatedException()
    return pendingFiles(context, profileId).mapNotNull { file ->
      try {
        PendingLogin.fromJson(JSONObject(open(file, privateKey)))
      } catch (e: AutofillKeyInvalidatedException) {
        throw e
      } catch (e: UserNotAuthenticatedException) {
        throw e
      } catch (e: Exception) {
        file.delete()
        null
      }
    }
  }

  /** `loginIds` null: every one of the profile. */
  fun removePending(context: Context, profileId: String, loginIds: List<String>?) {
    val targets = loginIds?.map { pendingFile(context, profileId, it) } ?: pendingFiles(context, profileId)
    targets.forEach { it.delete() }
  }

  /**
   * Drops the key and every profile's file: written again by the app on its next unlock. Logins
   * created in autofill and not saved yet go too: nothing could open them any more.
   */
  fun removeAll(context: Context) {
    keyStore().deleteEntry(KEY_ALIAS)
    directory(context).listFiles().orEmpty().forEach { it.delete() }
  }

  /**
   * Encrypting needs only the public half: no prompt. The existing key only, unlike `write`:
   * a new one would make every profile's file unreadable. Refused once a new biometric
   * enrollment killed it: the app would drop the login unread.
   */
  fun writePending(context: Context, profileId: String, login: PendingLogin) {
    val store = keyStore()
    val existing = store.getCertificate(KEY_ALIAS)?.publicKey?.takeIf { isUsable(store) }
      ?: throw AutofillKeyInvalidatedException()
    seal(softwareKey(existing), login.toJson().toString(), pendingFile(context, profileId, login.id))
  }

  /**
   * The key's public half, through a software key: the Keystore's own copy may ask for
   * the user. A key a new biometric enrollment invalidated is replaced, with every
   * profile's file (the other profiles write theirs again on their next unlock).
   */
  private fun publicKey(context: Context): PublicKey {
    val store = keyStore()
    val existing = store.getCertificate(KEY_ALIAS)?.publicKey
    val publicKey = if (existing != null && isUsable(store)) existing else {
      removeAll(context)
      createKey()
    }
    return softwareKey(publicKey)
  }

  private fun softwareKey(publicKey: PublicKey): PublicKey =
    KeyFactory.getInstance(publicKey.algorithm).generatePublic(X509EncodedKeySpec(publicKey.encoded))

  private fun isUsable(store: KeyStore): Boolean {
    val privateKey = store.getKey(KEY_ALIAS, null) as? PrivateKey ?: return false
    return try {
      Cipher.getInstance(RSA_TRANSFORMATION).init(Cipher.DECRYPT_MODE, privateKey, oaep)
      true
    } catch (e: UserNotAuthenticatedException) {
      true
    } catch (e: KeyPermanentlyInvalidatedException) {
      false
    }
  }

  private fun createKey(): PublicKey {
    val spec = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setKeySize(2048)
      .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA1)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_RSA_OAEP)
      .setUserAuthenticationRequired(true)
      .setInvalidatedByBiometricEnrollment(true)
      .apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          setUserAuthenticationParameters(AUTH_SECONDS, KeyProperties.AUTH_BIOMETRIC_STRONG)
        } else {
          @Suppress("DEPRECATION")
          setUserAuthenticationValidityDurationSeconds(AUTH_SECONDS)
        }
      }
      .build()
    return KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, "AndroidKeyStore")
      .apply { initialize(spec) }
      .generateKeyPair()
      .public
  }

  // Autofill, right after the biometric prompt

  /** A file that can't be read (half written, another format) is left out, not the others with it. */
  fun readAll(context: Context): List<AutofillProfile> {
    val privateKey = keyStore().getKey(KEY_ALIAS, null) as? PrivateKey ?: throw AutofillKeyInvalidatedException()
    return files(context).mapNotNull { file ->
      try {
        read(file, privateKey)
      } catch (e: AutofillKeyInvalidatedException) {
        throw e
      } catch (e: UserNotAuthenticatedException) {
        throw e
      } catch (e: Exception) {
        null
      }
    }
  }

  private fun read(file: File, privateKey: PrivateKey): AutofillProfile =
    parseProfile(file.nameWithoutExtension, open(file, privateKey))

  private fun open(file: File, privateKey: PrivateKey): String =
    DataInputStream(file.inputStream()).use { input ->
      require(input.readUnsignedByte() == FORMAT_VERSION) { "Unknown autofill file format" }
      val wrapped = ByteArray(input.readUnsignedShort()).also { input.readFully(it) }
      val iv = ByteArray(12).also { input.readFully(it) }
      val sealed = input.readBytes()
      val dataKey = try {
        Cipher.getInstance(RSA_TRANSFORMATION).run {
          init(Cipher.DECRYPT_MODE, privateKey, oaep)
          doFinal(wrapped)
        }
      } catch (e: KeyPermanentlyInvalidatedException) {
        throw AutofillKeyInvalidatedException()
      }
      val payload = Cipher.getInstance("AES/GCM/NoPadding").run {
        init(Cipher.DECRYPT_MODE, SecretKeySpec(dataKey, "AES"), GCMParameterSpec(128, iv))
        doFinal(sealed)
      }
      String(payload, Charsets.UTF_8)
    }

  private fun parseProfile(profileId: String, json: String): AutofillProfile {
    val root = JSONObject(json)
    val entries = root.getJSONArray("entries")
    return AutofillProfile(
      profileId = profileId,
      profileLabel = root.getString("profileLabel"),
      generator = root.optJSONObject("generator")?.let(GeneratorOptions::fromJson) ?: GeneratorOptions(),
      entries = (0 until entries.length()).map { i ->
        val entry = entries.getJSONObject(i)
        val hosts = entry.getJSONArray("hosts")
        AutofillEntry(
          recordId = entry.getString("recordId"),
          title = entry.getString("title"),
          username = entry.getString("username"),
          password = entry.getString("password"),
          hosts = (0 until hosts.length()).map { hosts.getString(it) },
        )
      },
    )
  }
}
