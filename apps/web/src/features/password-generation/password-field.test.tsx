import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import PasswordField from "./PasswordField";

vi.mock("@repo/ui/hooks/use-is-mobile", () => ({
  useIsMobile: () => false,
  isMobile: () => false,
}));

function Harness({ openGenerator }: { openGenerator?: boolean }) {
  const { control, setValue } = useForm<{ password?: string }>({ defaultValues: { password: "" } });
  return <PasswordField control={control} setValue={setValue} openGenerator={openGenerator} />;
}

describe("PasswordField", () => {
  it("opens the generator right away when asked to", async () => {
    renderWithProviders(<Harness openGenerator />);

    expect(await screen.findByRole("dialog", { name: "Generate password" })).toBeInTheDocument();
  });

  it("keeps it closed otherwise", async () => {
    renderWithProviders(<Harness />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
