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

data class AutofillProfile(val profileId: String, val profileLabel: String, val entries: List<AutofillEntry>)

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

  private fun file(context: Context, profileId: String): File {
    // Profile ids are UUIDs; anything else must not become a path.
    val id = UUID.fromString(profileId).toString()
    return File(directory(context), "$id.autofill")
  }

  private fun files(context: Context) =
    directory(context).listFiles { file -> file.name.endsWith(".autofill") }.orEmpty().toList()

  private fun keyStore() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

  fun hasEntries(context: Context) = files(context).isNotEmpty()

  // App

  fun write(context: Context, profileId: String, payload: String) {
    val dataKey = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    val wrapped = Cipher.getInstance(RSA_TRANSFORMATION).run {
      init(Cipher.ENCRYPT_MODE, publicKey(context), oaep)
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
    val target = file(context, profileId)
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

  /** Drops the key and every profile's file: written again by the app on its next unlock. */
  fun removeAll(context: Context) {
    keyStore().deleteEntry(KEY_ALIAS)
    files(context).forEach { it.delete() }
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
    return KeyFactory.getInstance(publicKey.algorithm).generatePublic(X509EncodedKeySpec(publicKey.encoded))
  }

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
      parseProfile(file.nameWithoutExtension, String(payload, Charsets.UTF_8))
    }

  private fun parseProfile(profileId: String, json: String): AutofillProfile {
    val root = JSONObject(json)
    val entries = root.getJSONArray("entries")
    return AutofillProfile(
      profileId = profileId,
      profileLabel = root.getString("profileLabel"),
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
