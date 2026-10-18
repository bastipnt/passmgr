package com.passmgr.autofill

import android.app.Activity
import android.app.assist.AssistStructure
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import android.widget.Toast
import androidx.fragment.app.FragmentActivity

fun autofillPresentation(context: Context, title: String, subtitle: String?) =
  RemoteViews(context.packageName, R.layout.passmgr_autofill_item).apply {
    setTextViewText(R.id.passmgr_autofill_title, title)
    setTextViewText(R.id.passmgr_autofill_subtitle, subtitle.orEmpty())
  }

fun Activity.assistStructure(): AssistStructure? =
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    intent.getParcelableExtra(AutofillManager.EXTRA_ASSIST_STRUCTURE, AssistStructure::class.java)
  } else {
    @Suppress("DEPRECATION")
    intent.getParcelableExtra(AutofillManager.EXTRA_ASSIST_STRUCTURE)
  }

/**
 * Biometric prompt, then hands the matching logins (else all of them) back to the autofill,
 * with "Create login" last.
 */
class AutofillAuthActivity : FragmentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val structure = assistStructure()
    if (structure == null) {
      finishCancelled()
      return
    }
    val request = AutofillRequest.parse(structure)
    promptAutofillBiometric(
      this,
      getString(R.string.passmgr_autofill_prompt),
      getString(R.string.passmgr_autofill_prompt_target, request.target(this)),
      onSuccess = { fill(request) },
      onCancel = ::finishCancelled,
    )
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
    if (profiles.isNotEmpty()) response.addDataset(AutofillCreateActivity.createDataset(this, request, profiles))
    request.saveInfo()?.let(response::setSaveInfo)
    setResult(Activity.RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, response.build()))
    finish()
  }

  private fun finishCancelled() {
    setResult(Activity.RESULT_CANCELED)
    finish()
  }
}
