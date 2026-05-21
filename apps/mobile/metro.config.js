const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const workerStub = path.resolve(projectRoot, "metro/worker-stub.js");
const sqlocalStub = path.resolve(projectRoot, "metro/sqlocal-stub.js");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.disableHierarchicalLookup = true;

// Module aliases:
// - Vite-style `?worker` imports (from @repo/crypto web workers) → runtime stub.
//   Auth-only flow never instantiates these workers.
// - `sqlocal` (browser SQLite WASM) → runtime stub. Mobile vault persistence
//   will use expo-sqlite in a follow-up milestone.
// - `@serenity-kit/opaque` (WASM, requires `globalThis.WebAssembly`) →
//   `react-native-opaque` (native module, identical API).
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith("?worker")) {
    return { type: "sourceFile", filePath: workerStub };
  }
  if (moduleName === "sqlocal" || moduleName.startsWith("sqlocal/")) {
    return { type: "sourceFile", filePath: sqlocalStub };
  }
  if (moduleName === "@serenity-kit/opaque") {
    return context.resolveRequest(context, "react-native-opaque", platform);
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
