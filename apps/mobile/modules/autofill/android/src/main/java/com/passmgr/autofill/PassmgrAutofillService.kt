package com.passmgr.autofill

import android.app.PendingIntent
import android.content.Intent
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest

/**
 * Offers one "Autofill with Passmgr" row on login fields; the logins themselves only
 * appear after `AutofillAuthActivity`'s biometric prompt opened them.
 */
class PassmgrAutofillService : AutofillService() {
  override fun onFillRequest(request: FillRequest, cancellationSignal: CancellationSignal, callback: FillCallback) {
    val structure = request.fillContexts.last().structure
    val parsed = AutofillRequest.parse(structure)
    if (parsed.fieldIds.isEmpty() || parsed.packageName == packageName || !AutofillVault.hasEntries(this)) {
      callback.onSuccess(null)
      return
    }
    // Mutable: the system adds the screen's structure to it (`EXTRA_ASSIST_STRUCTURE`).
    val intent = PendingIntent.getActivity(
      this,
      request.id,
      Intent(this, AutofillAuthActivity::class.java),
      PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
    val response = FillResponse.Builder()
      .setAuthentication(
        parsed.fieldIds.toTypedArray(),
        intent.intentSender,
        autofillPresentation(this, getString(R.string.passmgr_autofill_unlock), null),
      )
      .build()
    callback.onSuccess(response)
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    callback.onSuccess()
  }
}
