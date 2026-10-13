// OS autofill (modules/autofill, targets/autofill): the iOS credential provider
// extension reads what the app wrote through an app group and a keychain access
// group, both named after the extension's bundle id (`<app id>.autofill`), which
// is also what the extension's Info.plist expands them from.
//
// The app's own id stays the first keychain access group: it's the default one,
// where expo-secure-store keeps the login bundle, out of the extension's reach.
// Android needs nothing here: the module's manifest declares the service.
//
// Written at prebuild: an existing `ios/` needs `expo prebuild --clean`.
const { withEntitlementsPlist, withInfoPlist } = require("expo/config-plugins");

/** @param {string} bundleId the app's */
function autofillGroups(bundleId) {
  const extensionId = `${bundleId}.autofill`;
  return {
    appGroup: `group.${extensionId}`,
    keychainGroup: `$(AppIdentifierPrefix)${extensionId}`,
  };
}

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withAutofill = (config) => {
  const bundleId = config.ios?.bundleIdentifier;
  if (!bundleId) throw new Error("with-autofill: ios.bundleIdentifier is required");
  const { appGroup, keychainGroup } = autofillGroups(bundleId);

  config = withEntitlementsPlist(config, (config) => {
    const entitlements = config.modResults;
    entitlements["com.apple.developer.authentication-services.autofill-credential-provider"] = true;
    const appGroups = entitlements["com.apple.security.application-groups"] ?? [];
    if (!appGroups.includes(appGroup)) appGroups.push(appGroup);
    entitlements["com.apple.security.application-groups"] = appGroups;
    const appKeychainGroup = `$(AppIdentifierPrefix)${bundleId}`;
    const keychainGroups = (entitlements["keychain-access-groups"] ?? []).filter(
      (group) => group !== appKeychainGroup && group !== keychainGroup,
    );
    entitlements["keychain-access-groups"] = [appKeychainGroup, ...keychainGroups, keychainGroup];
    return config;
  });

  return withInfoPlist(config, (config) => {
    config.modResults.PassmgrAppGroup = appGroup;
    config.modResults.PassmgrKeychainGroup = keychainGroup;
    return config;
  });
};

module.exports = withAutofill;
module.exports.autofillGroups = autofillGroups;
