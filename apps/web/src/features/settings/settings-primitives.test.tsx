import { Select, SelectContent, SelectItem, SelectValue } from "@repo/ui/components/Select";
import { StatusPill } from "@repo/ui/components/StatusPill";
import userEvent from "@testing-library/user-event";
import { Monitor, Moon } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/render";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsPage } from "./SettingsPage";
import {
  SettingsRow,
  SettingsSegmented,
  SettingsSelectTrigger,
  SettingsSwitch,
} from "./SettingsRow";

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@repo/ui/hooks/use-is-mobile", () => ({ useIsMobile: () => viewport.mobile }));

afterEach(() => {
  viewport.mobile = false;
});

describe("SettingsPage", () => {
  it("titles the page one level under the overlay on desktop, with its action", () => {
    render(
      <SettingsPage
        title="Vaults"
        description="Where your items live."
        action={<button type="button">New vault</button>}
      >
        <SettingsGroup label="Your vaults">
          <SettingsRow label="Personal" />
        </SettingsGroup>
      </SettingsPage>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Vaults" })).toBeInTheDocument();
    expect(screen.getByText("Where your items live.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New vault" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Your vaults" })).toBeInTheDocument();
  });

  it("is the screen's h1 on a phone, its groups h2", () => {
    viewport.mobile = true;
    render(
      <SettingsPage title="Account">
        <SettingsGroup label="Sign-in">
          <SettingsRow label="Password" />
        </SettingsGroup>
      </SettingsPage>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Sign-in" })).toBeInTheDocument();
  });
});

describe("SettingsGroup", () => {
  it("is a region named by its label, with the footnote under the card", () => {
    render(
      <SettingsGroup label="Sign-in" footnote="Changing it signs out other devices.">
        <SettingsRow label="Password" hint="Your recovery key stays the same." />
        <SettingsRow label="Emergency kit" />
      </SettingsGroup>,
    );

    const region = screen.getByRole("region", { name: "Sign-in" });
    expect(within(region).getByText("Password")).toBeInTheDocument();
    expect(within(region).getByText("Your recovery key stays the same.")).toBeInTheDocument();
    expect(within(region).getByText("Changing it signs out other devices.")).toBeInTheDocument();
  });

  it("marks a danger group's label and its tappable rows", () => {
    render(
      <SettingsGroup label="Leave or delete" variant="danger">
        <SettingsRow label="Delete account" onClick={() => {}} />
      </SettingsGroup>,
    );

    expect(screen.getByRole("heading", { name: "Leave or delete" })).toHaveClass(
      "text-destructive",
    );
    expect(screen.getByRole("button", { name: "Delete account" })).toHaveClass("text-destructive");
  });
});

describe("SettingsRow", () => {
  it("names its switch by the label and describes it by the status and hint", async () => {
    const onCheckedChange = vi.fn();
    render(
      <SettingsGroup label="Sign-in">
        <SettingsRow
          label="Two-factor authentication"
          hint="Ask for a code when you sign in."
          status={{ label: "Off", tone: "destructive" }}
          control={<SettingsSwitch checked={false} onCheckedChange={onCheckedChange} />}
        />
      </SettingsGroup>,
    );

    const toggle = screen.getByRole("switch", { name: "Two-factor authentication" });
    expect(toggle).toHaveAccessibleDescription("· Off Ask for a code when you sign in.");
    expect(screen.getByText("· Off")).toHaveClass("text-destructive");

    await userEvent.click(toggle);
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything());
  });

  it("drills down as a link with its value", () => {
    render(
      <SettingsGroup label="Vault">
        <SettingsRow label="Tags" hint="Rename or remove tags." value="33" href="/settings/tags" />
      </SettingsGroup>,
    );

    const link = screen.getByRole("link", { name: "Tags" });
    expect(link).toHaveAttribute("href", "/settings/tags");
    expect(link).toHaveAccessibleDescription("Rename or remove tags. 33");
  });

  it("is one button when it opens something", async () => {
    const onClick = vi.fn();
    render(
      <SettingsGroup label="Sign-in">
        <SettingsRow label="Password" value="Change" onClick={onClick} />
      </SettingsGroup>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Password" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("names a segmented control by the label and reports the picked option", async () => {
    const onValueChange = vi.fn();
    render(
      <SettingsGroup label="Look">
        <SettingsRow
          label="Theme"
          control={
            <SettingsSegmented
              options={[
                { value: "system", label: "Device", icon: Monitor },
                { value: "dark", label: "Dark", icon: Moon },
              ]}
              value="system"
              onValueChange={onValueChange}
            />
          }
        />
      </SettingsGroup>,
    );

    const group = screen.getByRole("group", { name: "Theme" });
    expect(within(group).getByRole("button", { name: "Device" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(within(group).getByRole("button", { name: "Dark" }));
    expect(onValueChange).toHaveBeenCalledWith("dark");
  });

  it("names a select trigger by the label", () => {
    const items = [{ value: "15", label: "15 minutes" }];
    render(
      <SettingsGroup label="Locking">
        <SettingsRow
          label="Lock after"
          control={
            <Select items={items} defaultValue="15">
              <SettingsSelectTrigger>
                <SelectValue />
              </SettingsSelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsGroup>,
    );

    expect(screen.getByRole("combobox", { name: "Lock after" })).toHaveTextContent("15 minutes");
  });
});

describe("StatusPill", () => {
  it("says the status in words, the dot hidden", () => {
    render(<StatusPill tone="warning">Never backed up</StatusPill>);

    const pill = screen.getByText("Never backed up");
    expect(pill).toHaveAttribute("data-tone", "warning");
    expect(pill.querySelector("[aria-hidden='true']")).not.toBeNull();
  });
});
