const { autofillGroups } = require("../../plugins/with-autofill");

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => {
  const { appGroup, keychainGroup } = autofillGroups(config.ios.bundleIdentifier);
  return {
    type: "credentials-provider",
    name: "PassmgrAutofillExtension",
    displayName: "Passmgr",
    bundleIdentifier: ".autofill",
    deploymentTarget: "16.4",
    frameworks: ["AuthenticationServices", "LocalAuthentication", "SwiftUI"],
    entitlements: {
      "com.apple.developer.authentication-services.autofill-credential-provider": true,
      "com.apple.security.application-groups": [appGroup],
      "keychain-access-groups": [keychainGroup],
    },
  };
};
