// iOS 27 traps at launch (UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption)
// unless the app adopts the UIScene life cycle. Expo SDK 57 ships the scene
// delegate for this (`ExpoAppSceneDelegate`), but its prebuild template still
// generates the window-based AppDelegate. This plugin switches the generated
// project over:
//   - Info.plist declares a single window scene handled by EXExpoAppSceneDelegate
//   - AppDelegate conforms to ExpoReactNativeFactoryProvider and no longer
//     creates the window; the scene delegate creates it and starts React Native.
// Drop this plugin once the Expo template adopts the scene life cycle itself.

const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const CLASS_DECL = /class AppDelegate: ExpoAppDelegate(?!, ExpoReactNativeFactoryProvider)/;
const WINDOW_START =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (appDelegate) => {
    if (appDelegate.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    }
    let swiftSource = appDelegate.modResults.contents;
    if (swiftSource.includes('ExpoReactNativeFactoryProvider')) return appDelegate; // already adopted
    if (!CLASS_DECL.test(swiftSource) || !WINDOW_START.test(swiftSource)) {
      throw new Error(
        'withSceneLifecycle: the generated AppDelegate no longer matches the expected template. ' +
          'Check whether the Expo template now adopts the UIScene life cycle and remove this plugin.',
      );
    }
    swiftSource = swiftSource.replace(CLASS_DECL, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider');
    // The scene delegate creates the window and starts React Native in it.
    swiftSource = swiftSource.replace(WINDOW_START, '\n');
    appDelegate.modResults.contents = swiftSource;
    return appDelegate;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (infoPlist) => {
    infoPlist.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return infoPlist;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneManifest(withSceneAppDelegate(config));
};
