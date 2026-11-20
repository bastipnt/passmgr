import path from "node:path";

export const webAlias = { "@": path.resolve(import.meta.dirname, "./src") };
