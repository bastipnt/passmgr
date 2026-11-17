import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function emitRecordsChanged(userId: string): void {
  emitter.emit(`records:${userId}`);
}

export function onRecordsChanged(userId: string, cb: () => void): () => void {
  emitter.on(`records:${userId}`, cb);
  return () => emitter.off(`records:${userId}`, cb);
}

// Per session: its open record stream ends with a `signedOut` event.
export function emitSessionSignedOut(sessionId: string): void {
  emitter.emit(`signedout:${sessionId}`);
}

export function onSessionSignedOut(sessionId: string, cb: () => void): () => void {
  emitter.once(`signedout:${sessionId}`, cb);
  return () => emitter.off(`signedout:${sessionId}`, cb);
}

// Per session: logged out or expired; its open record stream just ends.
export function emitSessionEnded(sessionId: string): void {
  emitter.emit(`ended:${sessionId}`);
}

export function onSessionEnded(sessionId: string, cb: () => void): () => void {
  emitter.once(`ended:${sessionId}`, cb);
  return () => emitter.off(`ended:${sessionId}`, cb);
}

/** Open record streams per user, on this instance. */
export const MAX_RECORD_STREAMS_PER_USER = 20;
const openStreams = new Map<string, number>();

/** Count one more open stream; null past MAX_RECORD_STREAMS_PER_USER. The returned function releases it. */
export function claimRecordStream(userId: string): (() => void) | null {
  const open = openStreams.get(userId) ?? 0;
  if (open >= MAX_RECORD_STREAMS_PER_USER) return null;
  openStreams.set(userId, open + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (openStreams.get(userId) ?? 1) - 1;
    if (left > 0) openStreams.set(userId, left);
    else openStreams.delete(userId);
  };
}
