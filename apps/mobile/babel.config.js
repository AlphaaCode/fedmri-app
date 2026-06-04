module.exports = function (api) {
  api.cache(true);
  // Plain Expo preset. The app styles entirely with inline `style={{}}` objects
  // and react-navigation — it never uses nativewind `className`. nativewind was
  // unused AND mis-wired (no withNativeWind metro plugin, no global.css), and its
  // `jsxImportSource` routed every element through react-native-css-interop's
  // runtime (which pulls in reanimated and crashed the release build at launch).
  // Removed entirely; see package.json (nativewind/reanimated/worklets dropped).
  return {
    presets: ["babel-preset-expo"],
  };
};
