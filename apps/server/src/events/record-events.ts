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
