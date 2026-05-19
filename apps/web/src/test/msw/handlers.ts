import { http, HttpResponse } from "msw";

const TRPC_BASE = "http://localhost/trpc";

export function trpcQuery<T>(procedure: string, data: T) {
  return http.get(`${TRPC_BASE}/${procedure}`, () => HttpResponse.json({ result: { data } }));
}

export function trpcError(procedure: string, status: number, message: string) {
  return http.all(`${TRPC_BASE}/${procedure}`, () =>
    HttpResponse.json(
      { error: { message, code: status, data: { httpStatus: status } } },
      { status },
    ),
  );
}

export const handlers = [trpcQuery("appConfig.getConfig", { registrationEnabled: true })];
