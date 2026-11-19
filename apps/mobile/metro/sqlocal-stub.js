// Mobile never creates an `SQLocal` (browser-only, the web driver's), but loading the `@repo/store`
// barrel evaluates its import.
class SQLocal {
  constructor() {
    throw new Error("SQLocal instantiated on React Native. Use expo-sqlite when porting Vault.");
  }
}

module.exports = { SQLocal };
