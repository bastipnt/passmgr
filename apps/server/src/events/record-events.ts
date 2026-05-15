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
