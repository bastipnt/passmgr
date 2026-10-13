/** Hostnames the web app is served from: CORS and the WebAuthn origin check. */
export const allowedHostnames = new Set(["localhost"]);
if (process.env.CORS_ORIGIN) {
  try {
    allowedHostnames.add(new URL(process.env.CORS_ORIGIN).hostname);
  } catch {
    // If CORS_ORIGIN is just a hostname without protocol, add it directly
    allowedHostnames.add(process.env.CORS_ORIGIN);
  }
}
