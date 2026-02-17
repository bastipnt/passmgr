import { server } from "./src/server";
export type { AppRouter } from "./src/router";

const host = "http://localhost";
const port = 3000;

void (async () => {
  try {
    await server.listen({ port });
    console.log(`🦊 Server is running at ${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
