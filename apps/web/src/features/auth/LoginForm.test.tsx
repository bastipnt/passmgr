import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import LoginForm from "./LoginForm";

vi.mock("@repo/client", () => ({
  useAppConfig: () => ({ registrationEnabled: true, isLoading: false }),
}));

describe("LoginForm", () => {
  it("submits with form values on happy path", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<LoginForm onSubmit={onSubmit} loginError={false} loading={false} />);

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: /^unlock vault$/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      { email: "user@example.com", password: "hunter2hunter2" },
      expect.anything(),
    );
  });

  it("renders generic error on loginError without leaking password to the DOM", async () => {
    const password = "supersecret123";
    const { container } = renderWithProviders(
      <LoginForm onSubmit={vi.fn()} loginError={true} loading={false} />,
    );
    await userEvent.type(screen.getByLabelText("Password"), password);

    expect(screen.getByText(/check your email and password/i)).toBeInTheDocument();

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.value).toBe(password);
    expect(container.innerHTML).not.toContain(`>${password}<`);
  });

  it("renders generic error on unlockError", () => {
    renderWithProviders(
      <LoginForm onSubmit={vi.fn()} loginError={false} unlockError="failed" loading={false} />,
    );
    expect(screen.getByText(/check your email and password/i)).toBeInTheDocument();
  });

  it("password input has type=password and autocomplete=current-password", () => {
    renderWithProviders(<LoginForm onSubmit={vi.fn()} loginError={false} loading={false} />);

    const pw = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pw.type).toBe("password");
    expect(pw.autocomplete).toBe("current-password");
  });

  it("email input has autocomplete=username", () => {
    renderWithProviders(<LoginForm onSubmit={vi.fn()} loginError={false} loading={false} />);

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.autocomplete).toBe("username");
  });

  it("email field is disabled when storedEmail prop is provided", () => {
    renderWithProviders(
      <LoginForm
        onSubmit={vi.fn()}
        storedEmail="stored@example.com"
        loginError={false}
        loading={false}
      />,
    );

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email).toBeDisabled();
    expect(email.value).toBe("stored@example.com");
  });

  it("disables submit button while loading", () => {
    renderWithProviders(<LoginForm onSubmit={vi.fn()} loginError={false} loading={true} />);
    expect(screen.getByRole("button", { name: /unlock vault/i })).toBeDisabled();
  });

  it("locks the fields while loading and restores focus afterwards", async () => {
    const props = { onSubmit: vi.fn(), loginError: false };
    const { rerender } = renderWithProviders(<LoginForm {...props} loading={false} />);
    const pw = screen.getByLabelText("Password");
    await userEvent.click(pw);

    rerender(<LoginForm {...props} loading />);
    expect(pw).toBeDisabled();
    expect(screen.getByLabelText("Email")).toBeDisabled();
    // Browsers drop focus from a control once it's disabled; jsdom doesn't.
    pw.blur();

    rerender(<LoginForm {...props} loading={false} />);
    expect(pw).toBeEnabled();
    expect(pw).toHaveFocus();
  });

  it("explains that only the vaults on this device unlock offline", () => {
    renderWithProviders(
      <LoginForm
        onSubmit={vi.fn()}
        loginError={false}
        unlockError="wrong_account"
        loading={false}
      />,
    );
    expect(screen.getByText(/can't add an account offline/i)).toBeInTheDocument();
    expect(screen.queryByText(/check your email and password/i)).not.toBeInTheDocument();
  });

  it("reports user edits, but not the stored account being swapped in", async () => {
    const onEdit = vi.fn();
    const props = { onSubmit: vi.fn(), loginError: true, loading: false, onEdit };
    const { rerender } = renderWithProviders(<LoginForm {...props} />);

    rerender(<LoginForm {...props} storedEmail="alice@example.com" />);
    expect(onEdit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Password"), "x");
    expect(onEdit).toHaveBeenCalled();
  });
});
