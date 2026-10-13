package com.passmgr.autofill

import android.app.assist.AssistStructure
import android.text.InputType
import android.view.View
import android.view.autofill.AutofillId

/** The login fields of a screen and who is asking: a website's host, else the app's package. */
data class AutofillRequest(
  val usernameIds: List<AutofillId>,
  val passwordIds: List<AutofillId>,
  val webDomain: String?,
  val packageName: String,
) {
  val fieldIds get() = usernameIds + passwordIds

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

      fun visit(node: AssistStructure.ViewNode) {
        node.webDomain?.takeIf { it.isNotEmpty() }?.let { if (webDomain == null) webDomain = normalizeHost(it) }
        val id = node.autofillId
        if (id != null && node.autofillType == View.AUTOFILL_TYPE_TEXT) {
          when {
            isPassword(node) -> passwordIds += id
            isUsername(node) -> usernameIds += id
          }
        }
        for (i in 0 until node.childCount) visit(node.getChildAt(i))
      }
      for (i in 0 until structure.windowNodeCount) visit(structure.getWindowNodeAt(i).rootViewNode)

      return AutofillRequest(usernameIds, passwordIds, webDomain, structure.activityComponent.packageName)
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
