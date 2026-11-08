import { TRPCClientError } from "@trpc/client";

export type ErrorEnvironment = {
  appVersion: string;
  platform: string;
};

export type ErrorReport = {
  /** Short random ID, shown to the user and in the copied details. */
  id: string;
  /** Plain text to copy: ID, version, platform, error name and code, stack frames. */
  details: string;
};

const MAX_FRAMES = 30;
const FRAME = /^\s*at\s.*(:\d+:\d+\)?|\(native\)|<anonymous>\))\s*$|^\S*@\S*:\d+:\d+\s*$/;

const reports = new WeakMap<object, ErrorReport>();

function newErrorId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function errorName(err: unknown): string {
  return err instanceof Error && err.name ? err.name : "NonError";
}

function errorCode(err: unknown): string | undefined {
  if (err instanceof TRPCClientError) {
    const code: unknown = err.data?.code;
    return typeof code === "string" ? code : undefined;
  }
  const code: unknown = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code) ? code : undefined;
}

/**
 * Only the lines that end like a stack frame (location or native): the first line of `stack`
 * repeats the message, which can hold input values, and so can its later lines.
 */
function stackFrames(err: unknown): string[] {
  if (!(err instanceof Error) || !err.stack) return [];
  return err.stack
    .split("\n")
    .filter((line) => FRAME.test(line))
    .slice(0, MAX_FRAMES)
    .map((line) => line.trim());
}

/**
 * The same error object always gets the same ID, so the boundary, the toast
 * and the copied details agree. Holds no message text and no record data.
 */
export function createErrorReport(err: unknown, env: ErrorEnvironment): ErrorReport {
  const known = typeof err === "object" && err !== null ? reports.get(err) : undefined;
  if (known) return known;

  const id = newErrorId();
  const code = errorCode(err);
  const frames = stackFrames(err);
  const details = [
    `Error ID: ${id}`,
    `App version: ${env.appVersion}`,
    `Platform: ${env.platform}`,
    `Error: ${errorName(err)}`,
    ...(code ? [`Code: ${code}`] : []),
    ...(frames.length > 0 ? ["Stack:", ...frames.map((frame) => `  ${frame}`)] : []),
  ].join("\n");

  const report = { id, details };
  if (typeof err === "object" && err !== null) reports.set(err, report);
  return report;
}
