import type { MemberInfo } from "@repo/client";
import userEvent from "@testing-library/user-event";
import { TRPCClientError } from "@trpc/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, within } from "@/test/render";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { VaultMembersDialog } from "./VaultMembersDialog";

const mocks = vi.hoisted(() => ({
  lookupInvitee: vi.fn(),
  invite: vi.fn(),
  setMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveVault: vi.fn(),
  transferOwnership: vi.fn(),
  members: [] as MemberInfo[],
}));

vi.mock("@repo/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/client")>()),
  useVaultSharing: () => ({ ...mocks, pending: false, canShare: true }),
  useVaultMembers: () => ({ members: mocks.members, isPending: false, error: null }),
}));

const work = { vaultId: "v-work", name: "Work", kind: "shared", role: "owner" } as const;
const FINGERPRINT = "12345 67890 12345 67890 12345 67890";

function member(over: Partial<MemberInfo>): MemberInfo {
  return {
    userId: "u-bob",
    email: "bob@example.com",
    role: "write",
    status: "active",
    publicKey: { publicKey: "pk", keyVersion: 1 },
    fingerprint: FINGERPRINT,
    keyTrusted: true,
    isSelf: false,
    ...over,
  };
}

const self = member({ userId: "u-me", email: "me@example.com", role: "owner", isSelf: true });

/** A refusal as tRPC hands it over. */
function refusal(code: string) {
  return new TRPCClientError("refused", { result: { error: { data: { code } } } } as never);
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) if (typeof mock === "function") mock.mockReset();
  mocks.members = [self, member({})];
});

describe("InviteMemberDialog", () => {
  it("looks the invitee up, shows their code, then invites with the chosen role", async () => {
    const invitee = { email: "bob@example.com", publicKey: {}, fingerprint: FINGERPRINT };
    mocks.lookupInvitee.mockResolvedValue(invitee);
    const onOpenChange = vi.fn();
    renderWithProviders(<InviteMemberDialog vault={work} open onOpenChange={onOpenChange} />);

    await userEvent.type(screen.getByLabelText("Email"), "Bob@Example.com");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(mocks.lookupInvitee).toHaveBeenCalledWith("bob@example.com");
    expect(await screen.findByText(FINGERPRINT)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(mocks.invite).toHaveBeenCalledWith("v-work", invitee, "write");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says when there's no account with the email", async () => {
    mocks.lookupInvitee.mockRejectedValue(refusal("NOT_FOUND"));
    renderWithProviders(<InviteMemberDialog vault={work} open onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Email"), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/no account with this email/)).toBeInTheDocument();
  });
});

describe("VaultMembersDialog", () => {
  it("lists members with their codes and marks a changed key", async () => {
    mocks.members = [self, member({ keyTrusted: false, status: "pending" })];
    renderWithProviders(<VaultMembersDialog vault={work} open onOpenChange={vi.fn()} />);

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
    expect(screen.getByText("Key changed")).toBeInTheDocument();
    expect(screen.getAllByText(FINGERPRINT)).toHaveLength(2);
  });

  it("removes a member after confirming", async () => {
    renderWithProviders(<VaultMembersDialog vault={work} open onOpenChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "More for bob@example.com" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));
    const confirm = await screen.findByRole("dialog", { name: "Remove bob@example.com?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Remove" }));

    expect(mocks.removeMember).toHaveBeenCalledWith("v-work", "u-bob");
  });

  it("doesn't let the last owner leave", () => {
    renderWithProviders(<VaultMembersDialog vault={work} open onOpenChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Leave vault" })).toBeDisabled();
  });

  it("lets a reader leave but not manage anyone", async () => {
    mocks.members = [
      member({ userId: "u-owner", email: "owner@example.com", role: "owner" }),
      { ...self, role: "read" },
    ];
    const onOpenChange = vi.fn();
    renderWithProviders(
      <VaultMembersDialog vault={{ ...work, role: "read" }} open onOpenChange={onOpenChange} />,
    );

    expect(screen.queryByRole("button", { name: "Invite people" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More for/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Leave vault" }));
    const confirm = await screen.findByRole("dialog", { name: "Leave “Work”?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Leave vault" }));

    expect(mocks.leaveVault).toHaveBeenCalledWith("v-work");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
