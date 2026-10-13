import UIKit
import UniformTypeIdentifiers

/// Hands what was shared (a page URL, or text) to the app as `passmgr://share?text=…`,
/// where the website goes into a new login. Nothing is stored here: the vault may be locked.
final class ShareViewController: UIViewController {
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    Task {
      if let text = await sharedText(), let url = shareLink(text) {
        openApp(url)
      }
      extensionContext?.completeRequest(returningItems: nil)
    }
  }

  private func sharedText() async -> String? {
    let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
    let providers = items.flatMap { $0.attachments ?? [] }
    if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }),
      let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL
    {
      return url.absoluteString
    }
    if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }),
      let text = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String
    {
      return text
    }
    return items.compactMap { $0.attributedContentText?.string }.first
  }

  // `queryItems` leaves `+` as is, which the app's query parser reads as a space.
  private func shareLink(_ text: String) -> URL? {
    var allowed = CharacterSet.urlQueryAllowed
    allowed.remove(charactersIn: "+&=#")
    guard let value = String(text.prefix(2048)).addingPercentEncoding(withAllowedCharacters: allowed) else {
      return nil
    }
    return URL(string: "passmgr://share?text=\(value)")
  }

  // `UIApplication.open` is unavailable to extensions at compile time, but the app object is
  // in the responder chain and opens its own scheme when called through the runtime.
  private func openApp(_ url: URL) {
    let selector = NSSelectorFromString("openURL:options:completionHandler:")
    var responder: UIResponder? = self
    while let current = responder {
      if let application = current as? UIApplication, application.responds(to: selector) {
        typealias OpenURL = @convention(c) (
          AnyObject, Selector, NSURL, NSDictionary, (@convention(block) (Bool) -> Void)?
        ) -> Void
        let open = unsafeBitCast(application.method(for: selector), to: OpenURL.self)
        open(application, selector, url as NSURL, NSDictionary(), nil)
        return
      }
      responder = current.next
    }
  }
}
