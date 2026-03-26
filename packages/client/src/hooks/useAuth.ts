import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../api/client.js";
import { setToken, clearToken, isAuthenticated, getToken } from "../lib/auth.js";

interface User {
  id: string;
  name: string;
  householdId: string;
}

interface Household {
  id: string;
  name: string;
  inviteCode: string;
  preferredStore: string;
}

interface AuthState {
  user: User | null;
  household: Household | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    household: null,
    loading: true,
  });

  const fetchMe = useCallback(async () => {
    if (!getToken()) {
      setState({ user: null, household: null, loading: false });
      return;
    }
    try {
      const data = await apiFetch<{ user: User; household: Household }>("/auth/me");
      setState({ user: data.user, household: data.household, loading: false });
    } catch {
      setState({ user: null, household: null, loading: false });
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (userName: string, password: string) => {
    const data = await apiFetch<{ token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ userName, password }),
    });
    setToken(data.token);
    await fetchMe();
  };

  const register = async (householdName: string, userName: string, password: string) => {
    const data = await apiFetch<{ token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ householdName, userName, password }),
    });
    setToken(data.token);
    await fetchMe();
  };

  const join = async (inviteCode: string, userName: string, password: string) => {
    const data = await apiFetch<{ token: string }>("/auth/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode, userName, password }),
    });
    setToken(data.token);
    await fetchMe();
  };

  const logout = () => {
    clearToken();
    setState({ user: null, household: null, loading: false });
  };

  return {
    ...state,
    authenticated: isAuthenticated(),
    login,
    register,
    join,
    logout,
  };
}
