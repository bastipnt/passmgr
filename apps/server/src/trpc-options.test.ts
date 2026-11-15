import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { redis } from "./redis";
import { createTrpcOptions } from "./trpc-options";

afterAll(() => {
  redis.disconnect();
});

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function buildApp() {
  app = fastify();
  await app.register(fastifyTRPCPlugin, { trpcOptions: createTrpcOptions(app.log) });
  return app;
}

describe("tRPC adapter", () => {
  it("refuses a batched request", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/appConfig.getConfig,appConfig.getConfig?batch=1&input=%7B%7D",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: { message: "Batching is not enabled on the server" },
    });
  });

  it("still answers a single call", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/appConfig.getConfig" });
    expect(res.statusCode).toBe(200);
  });
});
