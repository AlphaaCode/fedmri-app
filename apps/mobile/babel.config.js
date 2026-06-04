module.exports = function (api) {
  api.cache(true);

  // nativewind/babel (= react-native-css-interop/babel) hardcodes the bare
  // string plugin "react-native-worklets/plugin". Babel resolves that string
  // relative to this config's directory, which fails on EAS because the
  // monorepo hoists react-native-worklets to the repo root (not apps/mobile).
  // babel-preset-expo already adds the worklets plugin itself via a resolved
  // absolute path (and skips it gracefully when unresolvable), so we keep the
  // css-interop className transform but strip the broken worklets string to
  // avoid the duplicate + the unresolvable-module crash.
  const nativewind = require("nativewind/babel")();
  const nativewindPlugins = nativewind.plugins.filter(
    (p) => !(typeof p === "string" && p.includes("react-native-worklets/plugin")),
  );

  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: nativewindPlugins,
  };
};
