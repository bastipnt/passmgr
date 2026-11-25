import type { DecryptedRecord } from "@repo/schema";
import userEvent from "@testing-library/user-event";
import { type ReactNode, Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { act, renderWithProviders, screen } from "@/test/render";
import CreateRecordSheet from "./CreateRecordSheet";
import EditRecordSheet from "./EditRecordSheet";
import RecordRoutes from "./routes";

// The real `useIsMobile`, on a `matchMedia` the test flips across 640px.
const media = vi.hoisted(() => ({ mobile: false, listeners: new Set<() => void>() }));
const versionsSheet = vi.hoisted(() => ({ mounts: 0 }));

const record = {
  recordId: "r-1",
  vaultId: "v-1",
  type: "card",
  title: "Visa",
  clientUpdatedAt: "2026-10-26T12:00:00Z",
} as DecryptedRecord;

vi.mock("@repo/client/src/hooks/use-tags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-tags")>()),
  useTags: () => [],
}));
vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useRecordVault: () => ({ writable: true }),
  useCreateRecord: () => ({ createRecord: vi.fn(), createPending: false }),
  SortedRecordsProvider: ({ children }: { children: ReactNode }) => children,
}));
// The pages are stubs: only a sheet rendered by the routes tree itself shows up.
vi.mock("@/components/RequireUnlocked", () => ({
  RequireUnlocked: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./RecordLayout", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./RecordPage", () => ({ default: () => <p>desktop page</p> }));
vi.mock("./MobileRecordPage", () => ({ default: () => <p>phone page</p> }));
vi.mock("./MobileVault", () => ({ default: () => null }));
vi.mock("./versions/VersionsSheet", async () => {
  const { useEffect } = await import("react");
  return {
    default: function VersionsSheet() {
      useEffect(() => {
        versionsSheet.mounts++;
      }, []);
      return <p>versions sheet</p>;
    },
  };
});
vi.mock("./RecordsEmptyState", () => ({ default: () => null }));
vi.mock("@repo/client/src/providers/SortedRecordsProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/providers/SortedRecordsProvider")>()),
  useSortedRecords: () => ({ vaultFilter: "all" }),
}));
vi.mock("@repo/client/src/hooks/use-vaults", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-vaults")>()),
  useVaults: () => ({ writableVaults: [] }),
}));
vi.mock("@repo/client/src/hooks/use-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client/src/hooks/use-records")>()),
  useGetRecord: () => ({ record: undefined, ready: true }),
}));
vi.mock("./use-record-actions", () => ({
  useRecordActions: () => ({
    deleteRecord: vi.fn(),
    handleSubmit: vi.fn(),
    record,
    ready: true,
    updatePending: false,
  }),
}));

beforeEach(() => {
  versionsSheet.mounts = 0;
  media.mobile = false;
  media.listeners.clear();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        get matches() {
          return query === "(max-width: 639px)" && media.mobile;
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => media.listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
          media.listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
});

function crossTo(mobile: boolean) {
  act(() => {
    media.mobile = mobile;
    for (const listener of media.listeners) listener();
  });
}

function renderAt(path: string) {
  const location = memoryLocation({ path, record: true });
  renderWithProviders(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <EditRecordSheet />
      <CreateRecordSheet />
    </Router>,
  );
}

const title = () => screen.getByRole("textbox", { name: "Title" });

describe("record sheets across the 640px breakpoint", () => {
  it("keeps the edit sheet's input, without asking to discard it", async () => {
    renderAt("/record/r-1/edit");
    await userEvent.type(title(), " Gold");

    crossTo(true);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(title()).toHaveValue("Visa Gold");

    crossTo(false);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(title()).toHaveValue("Visa Gold");
    expect(screen.queryByRole("dialog", { name: "Discard changes?" })).not.toBeInTheDocument();
  });

  it("keeps the edit sheet's input through the records routes' page swap", async () => {
    const location = memoryLocation({ path: "/record/r-1/edit", record: true });
    renderWithProviders(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <Suspense fallback={null}>
          <RecordRoutes />
        </Suspense>
      </Router>,
    );
    expect(await screen.findByText("desktop page")).toBeInTheDocument();
    await userEvent.type(title(), " Gold");

    crossTo(true);
    expect(screen.getByText("phone page")).toBeInTheDocument();
    expect(title()).toHaveValue("Visa Gold");

    crossTo(false);
    expect(screen.getByText("desktop page")).toBeInTheDocument();
    expect(title()).toHaveValue("Visa Gold");
  });

  it("keeps the versions sheet mounted through the records routes' page swap", async () => {
    const location = memoryLocation({ path: "/record/r-1/versions", record: true });
    renderWithProviders(
      <Router hook={location.hook} searchHook={location.searchHook}>
        <Suspense fallback={null}>
          <RecordRoutes />
        </Suspense>
      </Router>,
    );
    expect(await screen.findByText("desktop page")).toBeInTheDocument();

    crossTo(true);
    expect(screen.getByText("phone page")).toBeInTheDocument();
    crossTo(false);
    expect(screen.getByText("desktop page")).toBeInTheDocument();

    expect(screen.getByText("versions sheet")).toBeInTheDocument();
    expect(versionsSheet.mounts).toBe(1);
  });

  it("keeps the create sheet's input", async () => {
    renderAt("/?new=&type=note");
    await userEvent.type(title(), "Wiki");

    crossTo(true);
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(title()).toHaveValue("Wiki");

    crossTo(false);
    expect(screen.getByRole("button", { name: "Create secure note" })).toBeInTheDocument();
    expect(title()).toHaveValue("Wiki");
  });
});
