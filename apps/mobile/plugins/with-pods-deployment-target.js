// Raises every Pods target below the app's deployment target to it. Some pods
// declare a resource bundle without one (react-native-svg's `RNSVGFilters`),
// which CocoaPods leaves at 12.4: current Xcode refuses anything below 15.0.
//
// Written at prebuild: an existing `ios/` needs `expo prebuild --clean`.
const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

const MARKER = "# with-pods-deployment-target";

const SNIPPET = `
    ${MARKER}
    deployment_target = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new(deployment_target)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = deployment_target
        end
      end
    end`;

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withPodsDeploymentTarget = (config) =>
  withDangerousMod(config, [
    "ios",
    (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, "Podfile");
      const contents = fs.readFileSync(podfile, "utf8");
      if (contents.includes(MARKER)) return config;
      const hook = "post_install do |installer|";
      if (!contents.includes(hook))
        throw new Error("with-pods-deployment-target: no post_install in Podfile");
      fs.writeFileSync(podfile, contents.replace(hook, `${hook}${SNIPPET}`));
      return config;
    },
  ]);

module.exports = withPodsDeploymentTarget;
