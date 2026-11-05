import { SessionContext } from "@repo/client";
import { EMAIL_CODE_INVALID } from "@repo/schema";
import type { LocalProfile } from "@repo/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { TRPCClientError } from "@trpc/client";
import type { ContextType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeStore, profileEntry } from "@/test/fake-store";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { VerifyEmailPrompt } from "./VerifyEmailDialog";

// Real hook; the store, the app config and the server are replaced.
const store = createFakeStore();
const sync = vi.fn(async () => true);
vi.mock("@repo/client/src/providers/StoreProvider", async (importActual) => ({
  ...(await importActual<object>()),
  useStore: () => store,
}));
vi.mock("@repo/client/src/hooks/use-app-config", () => ({
  useAppConfig: () => ({ registrationEnabled: true, emailVerification: true, isLoading: false }),
}));
const trpc = vi.hoisted(() => ({
  user: {
    emailVerificationStatus: { query: vi.fn() },
    verifyEmail: { mutate: vi.fn() },
    sendVerificationCode: { mutate: vi.fn(async () => ({ ok: true })) },
  },
}));
vi.mock("@repo/client/src/util/trpc", () => ({
  useTRPC: () => ({}),
  useTRPCClient: () => trpc,
}));

let email = "alice@example.com";

function renderPrompt() {
  const profile: LocalProfile = { profileId: `p-${email}`, mode: "linked", email, userId: email };
  store.profile = profile;
  store.profiles = [profileEntry(profile)];
  const session = { mode: "online", networkOffline: false } as ContextType<typeof SessionContext>;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderWithProviders(
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={session}>
        <VerifyEmailPrompt />
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // The prompt opens once per account and page load: a new account per test.
  email = `user-${crypto.randomUUID()}@example.com`;
  (store.syncManager as unknown as { sync: typeof sync }).sync = sync;
  trpc.user.emailVerificationStatus.query.mockResolvedValue({ verified: false });
});

describe("VerifyEmailPrompt", () => {
  it("asks for the code of an unverified account, verifies it and syncs", async () => {
    trpc.user.verifyEmail.mutate.mockResolvedValue({ ok: true });
    renderPrompt();

    expect(await screen.findByRole("dialog", { name: "Verify your email" })).toHaveTextContent(
      email,
    );
    await userEvent.type(screen.getByLabelText("Code from the email"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trpc.user.verifyEmail.mutate).toHaveBeenCalledWith({ code: "123456" });
    expect(sync).toHaveBeenCalled();
  });

  it("says when the code is wrong and sends a new one on request", async () => {
    trpc.user.verifyEmail.mutate.mockRejectedValue(
      new TRPCClientError(EMAIL_CODE_INVALID, {
        result: {
          error: { code: -32600, message: EMAIL_CODE_INVALID, data: { code: "BAD_REQUEST" } },
        },
      } as never),
    );
    renderPrompt();

    await userEvent.type(await screen.findByLabelText("Code from the email"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText(/doesn't match/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(await screen.findByText("A new code is on its way.")).toBeInTheDocument();
    expect(trpc.user.sendVerificationCode.mutate).toHaveBeenCalled();
  });

  it("stays closed for a verified account", async () => {
    trpc.user.emailVerificationStatus.query.mockResolvedValue({ verified: true });
    renderPrompt();

    await waitFor(() => expect(trpc.user.emailVerificationStatus.query).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
