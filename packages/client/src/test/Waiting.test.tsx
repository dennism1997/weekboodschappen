import {beforeEach, describe, expect, it, vi} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithProviders} from "./setup.js";
import Waiting from "../pages/Waiting.js";

const authClientModule = await import("../lib/auth-client.js");
const { authClient } = authClientModule;

describe("Waiting page", () => {
  beforeEach(() => {
    vi.mocked(authClient.useSession).mockReturnValue({
      data: { user: { id: "u1", name: "Test" }, session: { id: "s1" } },
      isPending: false,
    } as any);
    vi.mocked(authClient.useActiveOrganization).mockReturnValue({
      data: { id: "org1", name: "Test Household" },
    } as any);
  });

  it("renders waiting message", () => {
    renderWithProviders(<Waiting />);
    expect(screen.getByText("Wachten op goedkeuring")).toBeInTheDocument();
  });

  it("shows household name in message", () => {
    renderWithProviders(<Waiting />);
    expect(screen.getByText(/Test Household/)).toBeInTheDocument();
  });

  it("has a refresh button", () => {
    renderWithProviders(<Waiting />);
    expect(screen.getByText("Opnieuw controleren")).toBeInTheDocument();
  });
});
