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

// 4. CRITICAL: react-native lives at the monorepo ROOT, where the web app pins
//    react 19.2.4. When react-native requires "react" it would resolve root's
//    19.2.4, but react-native 0.85.3 bundles react-native-renderer 19.2.3 and
//    crashes at launch unless `react` is EXACTLY 19.2.3 ("Incompatible React
//    versions"). extraNodeModules is only a fallback, so it doesn't override
//    react-native's own resolution. This resolver redirects EVERY react /
//    react-dom request — from app code AND from react-native — to the app's
//    local 19.2.3 copy, guaranteeing a single matching react.
const reactDir = path.resolve(projectRoot, "node_modules/react");
const reactDomDir = path.resolve(projectRoot, "node_modules/react-dom");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "react" || moduleName.startsWith("react/")) {
    return context.resolveRequest(context, reactDir + moduleName.slice("react".length), platform);
  }
  if (moduleName === "react-dom" || moduleName.startsWith("react-dom/")) {
    return context.resolveRequest(context, reactDomDir + moduleName.slice("react-dom".length), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
