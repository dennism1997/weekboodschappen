import {useQuery} from "@tanstack/react-query";
import {authClient} from "../lib/auth-client.js";
import {apiFetch} from "../api/client.js";

export function useAuth() {
  const session = authClient.useSession();
  const activeOrg = authClient.useActiveOrganization();

  const { data: adminStatus } = useQuery({
    queryKey: ["admin-status"],
    queryFn: () => apiFetch<{ isAdmin: boolean }>("/admin/status"),
    enabled: !!session.data?.session,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user: session.data?.user || null,
    household: activeOrg.data || null,
    loading: session.isPending,
    authenticated: !!session.data?.session,
    isAdmin: adminStatus?.isAdmin ?? false,
    signOut: authClient.signOut,
    createOrganization: authClient.organization.create,
    setActiveOrganization: authClient.organization.setActive,
  };
}
