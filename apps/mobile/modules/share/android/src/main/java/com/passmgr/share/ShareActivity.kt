package com.passmgr.share

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

class ShareActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val text = intent?.takeIf { it.action == Intent.ACTION_SEND }
      ?.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    if (text != null) {
      val link = Uri.Builder()
        .scheme("passmgr")
        .authority("share")
        .appendQueryParameter("text", text.take(2048))
        .build()
      startActivity(
        Intent(Intent.ACTION_VIEW, link)
          .setPackage(packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
    finish()
  }
}
