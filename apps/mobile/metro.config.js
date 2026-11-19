const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const sqlocalStub = path.resolve(projectRoot, "metro/sqlocal-stub.js");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Required for @cloudflare/opaque-ts → @noble/hashes which exposes
// subpaths (e.g. "@noble/hashes/lib/scrypt") only via the `exports` map.
config.resolver.unstable_enablePackageExports = true;

// `sqlocal` (browser SQLite WASM) → a stub: mobile uses expo-sqlite. `@noble/hashes/lib/*` exists only
// in the @noble/hashes@0.4.4 nested under @cloudflare/opaque-ts (the top-level one is v2.x): resolved there.
const cfNobleHashesDir = path.resolve(
  workspaceRoot,
  "node_modules/@cloudflare/opaque-ts/node_modules/@noble/hashes",
);

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
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

// withUniwindConfig must be the outermost wrapper. It compiles Tailwind classes
// (from the app + the @source globs in global.css, which cover @repo/ui-native)
// into native style objects at Metro build time.
module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
});
