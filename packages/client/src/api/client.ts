import {API_BASE} from "../lib/constants.js";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    },
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "HOUSEHOLD_PENDING") {
      window.location.href = "/waiting";
      throw new Error("Household pending approval");
    }
    if (body.error === "HOUSEHOLD_DEACTIVATED") {
      window.location.href = "/waiting";
      throw new Error("Household deactivated");
    }
    throw new Error(body.error || "Forbidden");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}
