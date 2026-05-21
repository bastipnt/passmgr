// Stub for `sqlocal` (browser-only SQLite WASM client). Mobile auth-only
// milestone never instantiates `Vault`, but the import is evaluated when the
// `@repo/store` barrel is loaded. Stub the constructor so the bundle works.
class SQLocal {
  constructor() {
    throw new Error("SQLocal instantiated on React Native. Use expo-sqlite when porting Vault.");
  }
}

module.exports = { SQLocal };
