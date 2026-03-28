import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./setup.js";
import Admin from "../pages/Admin.js";

const { apiFetch } = await import("../api/client.js");
const mockApiFetch = vi.mocked(apiFetch);

const mockHouseholds = [
  {
    id: "hh1",
    name: "Waiting Household",
    status: "waiting",
    createdAt: Date.now() - 3600000,
    memberCount: 1,
    recipeCount: 0,
    lastActivity: null,
    members: [{ id: "u1", name: "New User", role: "owner" }],
  },
  {
    id: "hh2",
    name: "Active Household",
    status: "active",
    createdAt: Date.now() - 86400000,
    memberCount: 2,
    recipeCount: 5,
    lastActivity: new Date().toISOString(),
    members: [
      { id: "u2", name: "Owner", role: "owner" },
      { id: "u3", name: "Member", role: "member" },
    ],
  },
];

const mockUsers = [
  { id: "u1", name: "New User", createdAt: Date.now(), memberships: [{ organizationId: "hh1", role: "owner", householdName: "Waiting Household" }], lastLogin: null },
  { id: "u2", name: "Owner", createdAt: Date.now(), memberships: [{ organizationId: "hh2", role: "owner", householdName: "Active Household" }], lastLogin: Date.now() },
];

const mockSystem = {
  dbSizeBytes: 1024 * 1024 * 5,
  dbSizeMB: 5,
  discountLastRefresh: new Date().toISOString(),
  aiCallCount: 42,
};

describe("Admin page", () => {
  beforeEach(() => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/households")) return mockHouseholds;
      if (path.includes("/users")) return mockUsers;
      if (path.includes("/system")) return mockSystem;
      return {};
    });
  });

  it("renders pending households", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Waiting Household")).toBeInTheDocument();
    });
    expect(screen.getByText("Goedkeuren")).toBeInTheDocument();
    expect(screen.getByText("Afwijzen")).toBeInTheDocument();
  });

  it("renders active households", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Active Household")).toBeInTheDocument();
    });
  });

  it("renders system health metrics", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("5 MB")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  it("renders user list", async () => {
    renderWithProviders(<Admin />);
    await waitFor(() => {
      expect(screen.getByText("Gebruikers (2)")).toBeInTheDocument();
    });
  });
});
