import { serverEnv } from "./src/env";
import { opsServer, server } from "./src/server";

export type { AppRouter } from "./src/router";

void (async () => {
  try {
    const { HOST, PORT, OPS_HOST, OPS_PORT } = serverEnv;
    await Promise.all([
      server.listen({ port: PORT, host: HOST }),
      opsServer.listen({ port: OPS_PORT, host: OPS_HOST }),
    ]);
    server.log.info(
      { host: HOST, port: PORT, opsHost: OPS_HOST, opsPort: OPS_PORT },
      "server.listen",
    );
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
})();
