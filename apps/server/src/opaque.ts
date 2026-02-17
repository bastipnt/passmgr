import { fromString } from "@repo/crypto";
export * as opaque from "@serenity-kit/opaque";

export const serverSetup = process.env.OPAQUE_SERVER_SETUP!;
export const serverKey = fromString(serverSetup);
