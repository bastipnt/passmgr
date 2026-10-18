package com.passmgr.autofill

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray

class PassmgrAutofillModule : Module() {
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PassmgrAutofill")

    AsyncFunction("isEnabled") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        context.getSystemService(AutofillManager::class.java)?.hasEnabledAutofillServices() == true
    }

    AsyncFunction("openSettings") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@AsyncFunction false
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      val intent = Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE)
        .setData(Uri.parse("package:${context.packageName}"))
      if (intent.resolveActivity(context.packageManager) == null) return@AsyncFunction false
      activity.startActivity(intent)
      true
    }

    AsyncFunction("setEntries") { profileId: String, payloadJson: String ->
      AutofillVault.write(context, profileId, payloadJson)
    }

    AsyncFunction("clearEntries") { profileId: String ->
      AutofillVault.remove(context, profileId)
    }

    AsyncFunction("hasPending") { profileId: String ->
      AutofillVault.hasPending(context, profileId)
    }

    AsyncFunction("readPending") { profileId: String, promise: Promise ->
      val activity = appContext.currentActivity as? FragmentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "No activity to ask for biometrics from", null)
        return@AsyncFunction
      }
      promptAutofillBiometric(
        activity,
        context.getString(R.string.passmgr_autofill_import_prompt),
        null,
        onSuccess = {
          try {
            val logins = AutofillVault.readPending(context, profileId).map { it.toJson() }
            promise.resolve(JSONArray(logins).toString())
          } catch (e: Exception) {
            promise.reject("ERR_READ_PENDING", e.message, e)
          }
        },
        onCancel = { promise.reject("ERR_CANCELLED", "Biometric prompt cancelled", null) },
      )
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("removePending") { profileId: String, loginIds: List<String>? ->
      AutofillVault.removePending(context, profileId, loginIds)
    }
  }
}
