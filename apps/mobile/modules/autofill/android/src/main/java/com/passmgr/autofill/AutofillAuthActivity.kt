package com.passmgr.autofill

import android.app.Activity
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import android.widget.Toast
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

fun autofillPresentation(context: Context, title: String, subtitle: String?) =
  RemoteViews(context.packageName, R.layout.passmgr_autofill_item).apply {
    setTextViewText(R.id.passmgr_autofill_title, title)
    setTextViewText(R.id.passmgr_autofill_subtitle, subtitle.orEmpty())
  }

/** Biometric prompt, then hands the matching logins (else all of them) back to the autofill. */
class AutofillAuthActivity : FragmentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val structure = assistStructure()
    if (structure == null) {
      finishCancelled()
      return
    }
    val request = AutofillRequest.parse(structure)
    val prompt = BiometricPrompt(
      this,
      ContextCompat.getMainExecutor(this),
      object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
          fill(request)
        }

        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
          finishCancelled()
        }
      },
    )
    prompt.authenticate(
      BiometricPrompt.PromptInfo.Builder()
        .setTitle(getString(R.string.passmgr_autofill_prompt))
        .setSubtitle(getString(R.string.passmgr_autofill_prompt_target, request.webDomain ?: appLabel(request.packageName)))
        .setAllowedAuthenticators(BIOMETRIC_STRONG)
        .setNegativeButtonText(getString(android.R.string.cancel))
        .build(),
    )
  }

  private fun appLabel(packageName: String): String = try {
    packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
  } catch (e: PackageManager.NameNotFoundException) {
    packageName
  }

  private fun assistStructure(): AssistStructure? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(AutofillManager.EXTRA_ASSIST_STRUCTURE, AssistStructure::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(AutofillManager.EXTRA_ASSIST_STRUCTURE)
    }

  private fun fill(request: AutofillRequest) {
    val profiles = try {
      AutofillVault.readAll(this)
    } catch (e: AutofillKeyInvalidatedException) {
      AutofillVault.removeAll(this)
      Toast.makeText(this, R.string.passmgr_autofill_setup_again, Toast.LENGTH_LONG).show()
      finishCancelled()
      return
    } catch (e: Exception) {
      // Mostly the key's 15 s after the prompt ran out: the user fills again.
      finishCancelled()
      return
    }
    val showProfile = profiles.size > 1
    val listed = profiles.flatMap { profile -> profile.entries.map { profile to it } }
      .sortedBy { (_, entry) -> entry.title.lowercase() }
    val offered = listed.filter { (_, entry) -> request.matches(entry) }.ifEmpty { listed }

    val response = FillResponse.Builder()
    for ((profile, entry) in offered) {
      val subtitle = listOf(entry.username, if (showProfile) profile.profileLabel else "")
        .filter { it.isNotEmpty() }
        .joinToString(" · ")
      @Suppress("DEPRECATION")
      val dataset = Dataset.Builder(autofillPresentation(this, entry.title, subtitle)).apply {
        request.usernameIds.forEach { setValue(it, AutofillValue.forText(entry.username)) }
        request.passwordIds.forEach { setValue(it, AutofillValue.forText(entry.password)) }
      }
      response.addDataset(dataset.build())
    }
    setResult(
      Activity.RESULT_OK,
      Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, if (offered.isEmpty()) null else response.build()),
    )
    finish()
  }

  private fun finishCancelled() {
    setResult(Activity.RESULT_CANCELED)
    finish()
  }
}
