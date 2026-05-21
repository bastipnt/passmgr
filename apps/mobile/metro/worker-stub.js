// Stub for Vite `?worker` imports. Web workers are not used on mobile;
// the auth-only milestone does not call any code paths that instantiate them.
// If a code path ever does call `new WorkerStub()` at runtime, it will throw
// instead of silently misbehaving.
module.exports = class WorkerStub {
  constructor() {
    throw new Error(
      "Web Worker constructed on React Native. This module should not be reached on mobile.",
    );
  }
};
