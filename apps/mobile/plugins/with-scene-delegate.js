// UIScene life cycle: iOS 27 terminates an app built with the iOS 27 SDK at
// launch unless it adopts scenes (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
// Expo SDK 57 ships the runtime side (`ExpoAppSceneDelegate`, which creates the
// window, starts React Native and re-feeds URLs / user activities to the app
// delegate) but its prebuild template doesn't wire it up yet. This writes what
// the SDK 58 template does: `SceneDelegate.swift`, the scene manifest, and an
// AppDelegate that leaves the window to the scene. Drop it once on SDK 58.
//
// Written at prebuild: an existing `ios/` needs `expo prebuild --clean`.
const fs = require("node:fs");
const path = require("node:path");
const {
  IOSConfig,
  withAppDelegate,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");

const SCENE_DELEGATE = `internal import Expo

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const START_REACT_NATIVE =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

/** @type {import("expo/config-plugins").ConfigPlugin} */
const withSceneDelegate = (config) => {
  config = withAppDelegate(config, (config) => {
    if (config.modResults.language !== "swift") {
      throw new Error("with-scene-delegate: expected a Swift AppDelegate");
    }
    let contents = config.modResults.contents;
    if (!contents.includes("ExpoReactNativeFactoryProvider")) {
      contents = contents.replace(
        "class AppDelegate: ExpoAppDelegate {",
        "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
      );
      if (!START_REACT_NATIVE.test(contents)) {
        throw new Error("with-scene-delegate: AppDelegate no longer matches the SDK 57 template");
      }
      contents = contents.replace(
        START_REACT_NATIVE,
        "\n    // The window is created and React Native is started by `SceneDelegate`.\n",
      );
    }
    config.modResults.contents = contents;
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return config;
  });

  config = withDangerousMod(config, [
    "ios",
    (config) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
      const file = path.join(
        config.modRequest.platformProjectRoot,
        projectName,
        "SceneDelegate.swift",
      );
      fs.writeFileSync(file, SCENE_DELEGATE);
      return config;
    },
  ]);

  return withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const filepath = `${projectName}/SceneDelegate.swift`;
    if (!project.hasFile(filepath)) {
      const { uuid } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project,
        targetUuid: uuid,
      });
    }
    return config;
  });
};

module.exports = withSceneDelegate;
