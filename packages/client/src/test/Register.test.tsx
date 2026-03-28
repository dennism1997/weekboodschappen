import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "./setup.js";
import Register from "../pages/Register.js";

describe("Register page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it("renders registration form", () => {
    renderWithProviders(<Register />);
    expect(screen.getByText("Toegang aanvragen")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Je naam")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Naam van je huishouden")).toBeInTheDocument();
  });

  it("shows error when submitting empty fields", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Register />);

    await user.click(screen.getByText("Aanvragen"));
    expect(screen.getByText("Vul alle velden in")).toBeInTheDocument();
  });

  it("has a link to login page", () => {
    renderWithProviders(<Register />);
    expect(screen.getByText("Al een account? Inloggen")).toBeInTheDocument();
  });

  it("submits registration and transitions to passkey step", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, userId: "new-id" }),
    } as Response);

    const authClientModule = await import("../lib/auth-client.js");
    vi.mocked(authClientModule.authClient.organization.list).mockResolvedValueOnce({
      data: [{ id: "org1" }],
    } as any);

    renderWithProviders(<Register />);

    await user.type(screen.getByPlaceholderText("Je naam"), "Test User");
    await user.type(screen.getByPlaceholderText("Naam van je huishouden"), "Test HH");
    await user.click(screen.getByText("Aanvragen"));

    await waitFor(() => {
      expect(screen.getByText("Passkey instellen")).toBeInTheDocument();
    });
  });
});
