import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import AuthLayout from "./AuthLayout";

describe("AuthLayout", () => {
  it("names the server on every auth screen", () => {
    renderWithProviders(
      <AuthLayout>
        <p>Any auth screen</p>
      </AuthLayout>,
    );
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Server vault.example.com");
  });
});
