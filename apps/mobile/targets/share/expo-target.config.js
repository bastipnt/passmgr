/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = () => ({
  type: "share",
  name: "PassmgrShareExtension",
  displayName: "Passmgr",
  bundleIdentifier: ".share",
  deploymentTarget: "16.4",
});
