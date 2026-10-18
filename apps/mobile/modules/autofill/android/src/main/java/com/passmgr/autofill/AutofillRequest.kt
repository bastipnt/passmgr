package com.passmgr.autofill

import android.app.assist.AssistStructure
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.service.autofill.SaveInfo
import android.text.InputType
import android.view.View
import android.view.autofill.AutofillId

/**
 * The login fields of a screen and who is asking: a website's host, else the app's package.
 * `username` / `password`: what is typed in them, for a save.
 */
data class AutofillRequest(
  val usernameIds: List<AutofillId>,
  val passwordIds: List<AutofillId>,
  val webDomain: String?,
  val packageName: String,
  val username: String = "",
  val password: String = "",
) {
  val fieldIds get() = usernameIds + passwordIds

  /** A new login's website: the page's, else the app's as `androidapp://` (`parseWebsite` in `@repo/util`). */
  val website get() = webDomain?.let { "https://$it" } ?: "androidapp://$packageName"

  /** The host, else the app's name. */
  fun target(context: Context): String = webDomain ?: try {
    val packageManager = context.packageManager
    packageManager.getApplicationLabel(packageManager.getApplicationInfo(packageName, 0)).toString()
  } catch (e: PackageManager.NameNotFoundException) {
    packageName
  }

  /**
   * Asks "Save to Passmgr?" once the form is sent: a password (with its username, if any), or
   * a username alone on a multi-step form's first screen, kept until the password screen.
   */
  fun saveInfo(): SaveInfo? {
    val usernameType = SaveInfo.SAVE_DATA_TYPE_USERNAME or SaveInfo.SAVE_DATA_TYPE_EMAIL_ADDRESS
    return when {
      passwordIds.isNotEmpty() -> SaveInfo.Builder(
        SaveInfo.SAVE_DATA_TYPE_PASSWORD or (if (usernameIds.isEmpty()) 0 else usernameType),
        passwordIds.toTypedArray(),
      )
        .apply { if (usernameIds.isNotEmpty()) setOptionalIds(usernameIds.toTypedArray()) }
        .setFlags(SaveInfo.FLAG_SAVE_ON_ALL_VIEWS_INVISIBLE)
        .build()
      usernameIds.isNotEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ->
        SaveInfo.Builder(usernameType, usernameIds.toTypedArray()).setFlags(SaveInfo.FLAG_DELAY_SAVE).build()
      else -> null
    }
  }

  /**
   * Logins for this website. An app never matches: any app can take a package name that
   * looks like a site's, so its logins are only listed for the user to pick from.
   */
  fun matches(entry: AutofillEntry): Boolean {
    val host = webDomain ?: return false
    return entry.hosts.any { host == it || host.endsWith(".$it") }
  }

  companion object {
    private val USERNAME_HINTS = listOf("user", "email", "login", "account")

    fun parse(structure: AssistStructure): AutofillRequest {
      val usernameIds = mutableListOf<AutofillId>()
      val passwordIds = mutableListOf<AutofillId>()
      var webDomain: String? = null
      var username = ""
      var password = ""

      fun visit(node: AssistStructure.ViewNode) {
        node.webDomain?.takeIf { it.isNotEmpty() }?.let { if (webDomain == null) webDomain = normalizeHost(it) }
        val id = node.autofillId
        if (id != null && node.autofillType == View.AUTOFILL_TYPE_TEXT) {
          val typed = node.autofillValue?.takeIf { it.isText }?.textValue?.toString().orEmpty()
          when {
            isPassword(node) -> {
              passwordIds += id
              if (password.isEmpty()) password = typed
            }
            isUsername(node) -> {
              usernameIds += id
              if (username.isEmpty()) username = typed
            }
          }
        }
        for (i in 0 until node.childCount) visit(node.getChildAt(i))
      }
      for (i in 0 until structure.windowNodeCount) visit(structure.getWindowNodeAt(i).rootViewNode)

      return AutofillRequest(
        usernameIds, passwordIds, webDomain, structure.activityComponent.packageName, username, password,
      )
    }

    /** A save's screens, oldest first (a multi-step form has several): the last one typed in wins. */
    fun parseSave(structures: List<AssistStructure>): AutofillRequest {
      val screens = structures.map(::parse)
      val last = screens.last()
      return last.copy(
        webDomain = screens.asReversed().firstNotNullOfOrNull { it.webDomain },
        username = screens.lastOrNull { it.username.isNotEmpty() }?.username.orEmpty(),
        password = screens.lastOrNull { it.password.isNotEmpty() }?.password.orEmpty(),
      )
    }

    private fun isPassword(node: AssistStructure.ViewNode): Boolean {
      if (node.autofillHints?.any { it.contains("password", ignoreCase = true) } == true) return true
      val variation = node.inputType and InputType.TYPE_MASK_VARIATION
      val passwordVariations = listOf(
        InputType.TYPE_TEXT_VARIATION_PASSWORD,
        InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD,
        InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD,
      )
      if (node.inputType and InputType.TYPE_MASK_CLASS == InputType.TYPE_CLASS_TEXT && variation in passwordVariations) {
        return true
      }
      return node.htmlInfo?.attributes?.any { it.first == "type" && it.second == "password" } == true
    }

    private fun isUsername(node: AssistStructure.ViewNode): Boolean {
      val hints = node.autofillHints.orEmpty().toList() + listOfNotNull(node.hint, node.idEntry)
      if (hints.any { hint -> USERNAME_HINTS.any { hint.contains(it, ignoreCase = true) } }) return true
      val variation = node.inputType and InputType.TYPE_MASK_VARIATION
      return variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS ||
        variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS
    }

    /** As `websiteHost` (`@repo/util`) writes hosts: lowercase, no `www.`. */
    private fun normalizeHost(host: String) = host.lowercase().removePrefix("www.")
  }
}
