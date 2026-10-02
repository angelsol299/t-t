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
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle: expected a Swift AppDelegate');
    }
    let src = cfg.modResults.contents;
    if (src.includes('ExpoReactNativeFactoryProvider')) return cfg; // already adopted
    if (!CLASS_DECL.test(src) || !WINDOW_START.test(src)) {
      throw new Error(
        'withSceneLifecycle: the generated AppDelegate no longer matches the expected template. ' +
          'Check whether the Expo template now adopts the UIScene life cycle and remove this plugin.',
      );
    }
    src = src.replace(CLASS_DECL, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider');
    // The scene delegate creates the window and starts React Native in it.
    src = src.replace(WINDOW_START, '\n');
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
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
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneManifest(withSceneAppDelegate(config));
};
