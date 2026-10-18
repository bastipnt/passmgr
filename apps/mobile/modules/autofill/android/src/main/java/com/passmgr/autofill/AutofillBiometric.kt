package com.passmgr.autofill

import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/** The strong-biometric prompt the autofill key's private half needs right before each use. */
fun promptAutofillBiometric(
  activity: FragmentActivity,
  title: String,
  subtitle: String?,
  onSuccess: () -> Unit,
  onCancel: () -> Unit,
) {
  val prompt = BiometricPrompt(
    activity,
    ContextCompat.getMainExecutor(activity),
    object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = onSuccess()

      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) = onCancel()
    },
  )
  prompt.authenticate(
    BiometricPrompt.PromptInfo.Builder()
      .setTitle(title)
      .apply { if (subtitle != null) setSubtitle(subtitle) }
      .setAllowedAuthenticators(BIOMETRIC_STRONG)
      .setNegativeButtonText(activity.getString(android.R.string.cancel))
      .build(),
  )
}
