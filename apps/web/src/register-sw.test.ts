import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchForUpdates } from "./register-sw";

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installing";
  postMessage = vi.fn();
  install() {
    this.state = "installed";
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  findUpdate(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
}

let container: EventTarget & { controller: object | null };
const reload = vi.fn();

function watch(registration: FakeRegistration) {
  const onUpdateReady = vi.fn<(reload: () => void) => void>();
  watchForUpdates(registration as unknown as ServiceWorkerRegistration, onUpdateReady);
  return onUpdateReady;
}

beforeEach(() => {
  container = Object.assign(new EventTarget(), { controller: {} as object | null });
  vi.stubGlobal("navigator", { serviceWorker: container });
  vi.spyOn(window, "location", "get").mockReturnValue({ reload } as unknown as Location);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  reload.mockReset();
});

describe("watchForUpdates", () => {
  it("activates a version already waiting at startup and reloads once it takes over", () => {
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker();
    const onUpdateReady = watch(registration);

    expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledOnce();
    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("offers a version that finishes installing during the session, activating it only on request", () => {
    const registration = new FakeRegistration();
    const onUpdateReady = watch(registration);
    const worker = new FakeWorker();

    registration.findUpdate(worker);
    expect(onUpdateReady).not.toHaveBeenCalled();
    worker.install();
    expect(onUpdateReady).toHaveBeenCalledOnce();
    expect(worker.postMessage).not.toHaveBeenCalled();

    onUpdateReady.mock.calls[0]![0]();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("offers a version that was already installing when registration resolved", () => {
    const registration = new FakeRegistration();
    const worker = new FakeWorker();
    registration.installing = worker;
    const onUpdateReady = watch(registration);

    worker.install();
    expect(onUpdateReady).toHaveBeenCalledOnce();
  });

  it("offers a reload when another tab activated the new version", () => {
    const onUpdateReady = watch(new FakeRegistration());

    container.dispatchEvent(new Event("controllerchange"));
    expect(reload).not.toHaveBeenCalled();
    onUpdateReady.mock.calls[0]![0]();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does nothing on the first install", () => {
    container.controller = null;
    const registration = new FakeRegistration();
    const onUpdateReady = watch(registration);
    const worker = new FakeWorker();

    registration.findUpdate(worker);
    worker.install();
    container.dispatchEvent(new Event("controllerchange"));
    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
