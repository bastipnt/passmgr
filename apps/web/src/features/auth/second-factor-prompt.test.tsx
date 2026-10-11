import { useSecondFactorPrompt } from "@repo/client/src/providers/SecondFactorPromptProvider";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { SecondFactorPromptRoot } from "./SecondFactorPromptRoot";

/** Stands in for a login outside the login form (reconnect, fresh login). */
function Asker() {
  const prompt = useSecondFactorPrompt();
  const [answer, setAnswer] = useState<string>();
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const first = await prompt({ invalid: false });
          const code = first === "000000" ? await prompt({ invalid: true }) : first;
          if (code !== null) prompt.done?.();
          setAnswer(String(code));
        }}
      >
        Ask
      </button>
      {answer !== undefined && <output>{answer}</output>}
    </>
  );
}

function renderRoot() {
  renderWithProviders(
    <SecondFactorPromptRoot>
      <Asker />
    </SecondFactorPromptRoot>,
  );
}

describe("SecondFactorPromptRoot", () => {
  it("asks in a dialog and hands back the code", async () => {
    renderRoot();
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    await userEvent.type(await screen.findByLabelText("Authentication code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByRole("status")).toHaveTextContent("123456");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says when the last code was wrong", async () => {
    renderRoot();
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await userEvent.type(await screen.findByLabelText("Authentication code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText(/that code didn't work/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Authentication code"), "654321");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("status")).toHaveTextContent("654321");
  });

  it("closing the dialog cancels (null)", async () => {
    renderRoot();
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByLabelText("Authentication code");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("status")).toHaveTextContent("null");
  });
});
