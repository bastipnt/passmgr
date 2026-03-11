import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function emitItemsChanged(userId: string): void {
  emitter.emit(`items:${userId}`);
}

export function onItemsChanged(userId: string, cb: () => void): () => void {
  emitter.on(`items:${userId}`, cb);
  return () => emitter.off(`items:${userId}`, cb);
}
