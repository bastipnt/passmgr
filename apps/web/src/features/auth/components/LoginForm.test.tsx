import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "@/test/render";
import LoginForm from "./LoginForm";

vi.mock("@repo/client", () => ({
  useAppConfig: () => ({ registrationEnabled: true, isLoading: false }),
}));

describe("LoginForm", () => {
  it("submits with form values on happy path", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <LoginForm onSubmit={onSubmit} loginError={false} unlockError={false} loading={false} />,
    );

    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2hunter2");
    await userEvent.click(screen.getByRole("button", { name: /^login$/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      { email: "user@example.com", password: "hunter2hunter2" },
      expect.anything(),
    );
  });

  it("renders generic error on loginError without leaking password to the DOM", async () => {
    const password = "supersecret123";
    const { container } = renderWithProviders(
      <LoginForm onSubmit={vi.fn()} loginError={true} unlockError={false} loading={false} />,
    );
    await userEvent.type(screen.getByLabelText("Password"), password);

    expect(screen.getByText(/login error please try again/i)).toBeInTheDocument();

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.value).toBe(password);
    expect(container.innerHTML).not.toContain(`>${password}<`);
  });

  it("renders generic error on unlockError", () => {
    renderWithProviders(
      <LoginForm onSubmit={vi.fn()} loginError={false} unlockError={true} loading={false} />,
    );
    expect(screen.getByText(/login error please try again/i)).toBeInTheDocument();
  });

  it("password input has type=password and autocomplete=current-password", () => {
    renderWithProviders(
      <LoginForm onSubmit={vi.fn()} loginError={false} unlockError={false} loading={false} />,
    );

    const pw = screen.getByLabelText("Password") as HTMLInputElement;
    expect(pw.type).toBe("password");
    expect(pw.autocomplete).toBe("current-password");
  });

  it("email input has autocomplete=username", () => {
    renderWithProviders(
      <LoginForm onSubmit={vi.fn()} loginError={false} unlockError={false} loading={false} />,
    );

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.autocomplete).toBe("username");
  });

  it("email field is disabled when storedEmail prop is provided", () => {
    renderWithProviders(
      <LoginForm
        onSubmit={vi.fn()}
        storedEmail="stored@example.com"
        loginError={false}
        unlockError={false}
        loading={false}
      />,
    );

    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email).toBeDisabled();
    expect(email.value).toBe("stored@example.com");
  });

  it("disables submit button while loading", () => {
    renderWithProviders(
      <LoginForm onSubmit={vi.fn()} loginError={false} unlockError={false} loading={true} />,
    );
    expect(screen.getByRole("button", { name: /login/i })).toBeDisabled();
  });
});
