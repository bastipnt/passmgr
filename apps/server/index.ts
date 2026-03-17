import { server } from "./src/server";
export type { AppRouter } from "./src/router";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

void (async () => {
  try {
    await server.listen({ port, host });
    console.log(`Server is running at http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
