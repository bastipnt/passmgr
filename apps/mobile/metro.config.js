const { getDefaultConfig } = require("expo/metro-config");
const { withTamagui } = require("@tamagui/metro-plugin");
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

// Required for @cloudflare/opaque-ts → @noble/hashes which exposes
// subpaths (e.g. "@noble/hashes/lib/scrypt") only via the `exports` map.
config.resolver.unstable_enablePackageExports = true;

// Module aliases:
// - Vite-style `?worker` imports (from @repo/crypto web workers) → runtime stub.
//   Auth-only flow never instantiates these workers.
// - `sqlocal` (browser SQLite WASM) → runtime stub. Mobile vault persistence
//   will use expo-sqlite in a follow-up milestone.
// Note: @serenity-kit/opaque alias removed — OPAQUE now uses
// @cloudflare/opaque-ts (pure TS) which runs natively in RN provided a
// crypto.subtle polyfill (e.g. react-native-quick-crypto) is loaded at entry.
// @cloudflare/opaque-ts depends on @noble/hashes@0.4.4 which is nested under
// its own node_modules. Because `disableHierarchicalLookup` is on, Metro only
// looks at the top-level node_modules where @noble/hashes is v2.x with no
// `lib/` subpath, so imports like `@noble/hashes/lib/scrypt` fail. Resolve
// those explicitly to the nested copy until cloudflare/opaque-ts updates.
const cfNobleHashesDir = path.resolve(
  workspaceRoot,
  "node_modules/@cloudflare/opaque-ts/node_modules/@noble/hashes",
);

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith("?worker")) {
    return { type: "sourceFile", filePath: workerStub };
  }
  if (moduleName === "sqlocal" || moduleName.startsWith("sqlocal/")) {
    return { type: "sourceFile", filePath: sqlocalStub };
  }
  if (moduleName.startsWith("@noble/hashes/lib/")) {
    const sub = moduleName.slice("@noble/hashes/lib/".length);
    // `./lib/crypto` has a `node` variant (imports Node "crypto") and a
    // `browser` variant. RN has no Node crypto, so always pick the browser
    // shim — it only reads `self.crypto`, which on RN is provided once a
    // WebCrypto polyfill (react-native-quick-crypto) is installed.
    const file = sub === "crypto" ? "cryptoBrowser.js" : `${sub}.js`;
    return {
      type: "sourceFile",
      filePath: path.resolve(cfNobleHashesDir, "lib/esm", file),
    };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withTamagui(config, {
  components: ["tamagui"],
  config: "../../packages/ui-native/src/tamagui.config.ts",
});
