import "@testing-library/jest-dom/vitest";
import {cleanup, render} from "@testing-library/react";
import {afterEach, vi} from "vitest";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter} from "react-router-dom";
import type {ReactElement} from "react";

afterEach(() => {
  cleanup();
});

// Mock auth client
vi.mock("../lib/auth-client.js", () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false })),
    useActiveOrganization: vi.fn(() => ({ data: null })),
    getSession: vi.fn(async () => ({ data: { user: { id: "test-user", name: "Test" } } })),
    signOut: vi.fn(),
    organization: {
      create: vi.fn(),
      setActive: vi.fn(),
      list: vi.fn(async () => ({ data: [] })),
    },
    passkey: {
      addPasskey: vi.fn(async () => ({})),
    },
    signIn: {
      passkey: vi.fn(),
    },
  },
}));

// Mock apiFetch
vi.mock("../api/client.js", () => ({
  apiFetch: vi.fn(),
}));

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { route = "/" }: { route?: string } = {},
) {
  const queryClient = createTestQueryClient();
  return {
    ...render(ui, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>
            {children}
          </MemoryRouter>
        </QueryClientProvider>
      ),
    }),
    queryClient,
  };
}
