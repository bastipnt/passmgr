package com.passmgr.autofill

import android.app.Activity
import android.app.AlertDialog
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Typeface
import android.os.Bundle
import android.service.autofill.Dataset
import android.text.InputType
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.Toast
import androidx.fragment.app.FragmentActivity
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/**
 * "Create login": a username and a generated password, filled in at once. The login is
 * encrypted to the autofill key (no prompt) and saved into the vault by the app on its next
 * unlock: the vault keys only exist in the app's JS session.
 *
 * Opened from the fill list (profiles passed in, the prompt already passed) or from "Save to
 * Passmgr?" with what was typed (asks for biometrics first, to list the profiles).
 */
class AutofillCreateActivity : FragmentActivity() {
  private data class ProfileOption(val id: String, val label: String, val generator: GeneratorOptions)

  private lateinit var request: AutofillRequest
  private var saving = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val saved = intent.getStringExtra(EXTRA_SAVE)
    saving = saved != null
    request = if (saved != null) {
      val json = JSONObject(saved)
      AutofillRequest(
        usernameIds = emptyList(),
        passwordIds = emptyList(),
        webDomain = json.optString("webDomain").ifEmpty { null },
        packageName = json.getString("packageName"),
        username = json.getString("username"),
        password = json.getString("password"),
      )
    } else {
      val structure = assistStructure()
      if (structure == null) {
        finishCancelled()
        return
      }
      AutofillRequest.parse(structure)
    }

    val passed = intent.getStringExtra(EXTRA_PROFILES)?.let(::parseProfiles)
    if (passed != null) {
      if (passed.isEmpty()) finishCancelled() else show(passed)
      return
    }
    promptAutofillBiometric(
      this,
      getString(R.string.passmgr_autofill_save_prompt),
      request.target(this),
      onSuccess = ::loadProfiles,
      onCancel = ::finishCancelled,
    )
  }

  private fun loadProfiles() {
    val profiles = try {
      AutofillVault.readAll(this).map { ProfileOption(it.profileId, it.profileLabel, it.generator) }
    } catch (e: Exception) {
      Toast.makeText(this, R.string.passmgr_autofill_setup_again, Toast.LENGTH_LONG).show()
      finishCancelled()
      return
    }
    if (profiles.isEmpty()) {
      finishCancelled()
      return
    }
    show(profiles)
  }

  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()

  private fun show(profiles: List<ProfileOption>) {
    val sorted = profiles.sortedBy { it.label.lowercase() }
    val title = field(getString(R.string.passmgr_autofill_field_title), request.target(this))
    val username = field(getString(R.string.passmgr_autofill_field_username), request.username).apply {
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
    }
    val password = field(
      getString(R.string.passmgr_autofill_field_password),
      request.password.ifEmpty { PasswordGenerator.generate(sorted.first().generator) },
    ).apply {
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
      typeface = Typeface.MONOSPACE
      layoutParams = LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f)
    }
    val profile = Spinner(this).apply {
      adapter = ArrayAdapter(context, android.R.layout.simple_spinner_dropdown_item, sorted.map { it.label })
    }
    val regenerate = ImageButton(this).apply {
      setImageResource(android.R.drawable.ic_popup_sync)
      contentDescription = getString(R.string.passmgr_autofill_new_password)
      setBackgroundResource(android.R.color.transparent)
      setOnClickListener {
        password.setText(PasswordGenerator.generate(sorted[profile.selectedItemPosition].generator))
      }
    }
    val form = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(8), dp(20), 0)
      addView(title)
      addView(username)
      addView(LinearLayout(context).apply {
        addView(password)
        addView(regenerate, LinearLayout.LayoutParams(dp(48), dp(48)))
      }, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
      if (sorted.size > 1) addView(profile)
    }

    val night = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    val theme = if (night) android.R.style.Theme_DeviceDefault_Dialog_Alert else android.R.style.Theme_DeviceDefault_Light_Dialog_Alert
    AlertDialog.Builder(this, theme)
      .setTitle(if (saving) R.string.passmgr_autofill_save_title else R.string.passmgr_autofill_create_title)
      .setMessage(R.string.passmgr_autofill_create_note)
      .setView(form)
      .setNegativeButton(android.R.string.cancel) { _, _ -> finishCancelled() }
      .setPositiveButton(if (saving) R.string.passmgr_autofill_save else R.string.passmgr_autofill_create) { _, _ ->
        create(
          sorted[profile.selectedItemPosition].id,
          title.text.toString().trim(),
          username.text.toString(),
          password.text.toString(),
        )
      }
      .setOnCancelListener { finishCancelled() }
      .show()
  }

  private fun field(hint: String, value: String) = EditText(this).apply {
    this.hint = hint
    setText(value)
    setSingleLine()
    importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_NO
  }

  private fun create(profileId: String, title: String, username: String, password: String) {
    val login = PendingLogin(
      id = UUID.randomUUID().toString(),
      title = title.ifEmpty { request.target(this) },
      website = request.website,
      username = username,
      password = password,
      createdAt = Instant.now().toString(),
    )
    try {
      AutofillVault.writePending(this, profileId, login)
    } catch (e: Exception) {
      Toast.makeText(this, R.string.passmgr_autofill_setup_again, Toast.LENGTH_LONG).show()
      finishCancelled()
      return
    }
    if (saving) {
      setResult(Activity.RESULT_OK)
      finish()
      return
    }
    @Suppress("DEPRECATION")
    val dataset = Dataset.Builder(autofillPresentation(this, login.title, username)).apply {
      request.usernameIds.forEach { setValue(it, AutofillValue.forText(username)) }
      request.passwordIds.forEach { setValue(it, AutofillValue.forText(password)) }
    }.build()
    setResult(Activity.RESULT_OK, Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset))
    finish()
  }

  private fun finishCancelled() {
    setResult(Activity.RESULT_CANCELED)
    finish()
  }

  companion object {
    private const val EXTRA_PROFILES = "com.passmgr.autofill.PROFILES"
    private const val EXTRA_SAVE = "com.passmgr.autofill.SAVE"
    private const val CREATE_REQUEST_CODE = 1
    private const val SAVE_REQUEST_CODE = 2

    private fun parseProfiles(json: String): List<ProfileOption> {
      val array = JSONArray(json)
      return (0 until array.length()).map { i ->
        val profile = array.getJSONObject(i)
        ProfileOption(
          profile.getString("id"),
          profile.getString("label"),
          GeneratorOptions.fromJson(profile.getJSONObject("generator")),
        )
      }
    }

    /** The fill list's last row. Its fields' values are unknown until the form is sent. */
    fun createDataset(context: Context, request: AutofillRequest, profiles: List<AutofillProfile>): Dataset {
      val passed = JSONArray(
        profiles.map {
          JSONObject().put("id", it.profileId).put("label", it.profileLabel).put("generator", it.generator.toJson())
        },
      )
      // Mutable: the system adds the screen's structure to it (`EXTRA_ASSIST_STRUCTURE`).
      val intent = PendingIntent.getActivity(
        context,
        CREATE_REQUEST_CODE,
        Intent(context, AutofillCreateActivity::class.java).putExtra(EXTRA_PROFILES, passed.toString()),
        PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_MUTABLE,
      )
      val title = context.getString(R.string.passmgr_autofill_create_for, request.target(context))
      @Suppress("DEPRECATION")
      return Dataset.Builder(autofillPresentation(context, title, null)).apply {
        request.fieldIds.forEach { setValue(it, null) }
        setAuthentication(intent.intentSender)
      }.build()
    }

    /** "Save to Passmgr?" accepted: the same form, with what was typed. */
    fun saveIntent(context: Context, request: AutofillRequest): PendingIntent {
      val saved = JSONObject()
        .put("webDomain", request.webDomain.orEmpty())
        .put("packageName", request.packageName)
        .put("username", request.username)
        .put("password", request.password)
      return PendingIntent.getActivity(
        context,
        SAVE_REQUEST_CODE,
        Intent(context, AutofillCreateActivity::class.java).putExtra(EXTRA_SAVE, saved.toString()),
        PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
  }
}
