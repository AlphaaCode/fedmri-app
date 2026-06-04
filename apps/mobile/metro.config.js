// Expo monorepo Metro config — follows the official guide:
// https://docs.expo.dev/guides/monorepos/#modify-the-metro-config
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo (extend Expo's defaults, don't replace them).
config.watchFolders = [...(config.watchFolders ?? []), monorepoRoot];

// 2. Resolve modules from the app first, then the monorepo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// 3. Force React / React-DOM / React-Native to a single copy regardless of how
//    the workspace hoists them, so the bundle never contains two react runtimes.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-dom": path.resolve(projectRoot, "node_modules/react-dom"),
  // react-native is hoisted to the monorepo root (not the app), so point there.
  "react-native": path.resolve(monorepoRoot, "node_modules/react-native"),
};

module.exports = config;
