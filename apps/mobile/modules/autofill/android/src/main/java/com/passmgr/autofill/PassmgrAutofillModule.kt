package com.passmgr.autofill

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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
  }
}
