import { authClient } from "../lib/auth-client.js";

export function useAuth() {
  const session = authClient.useSession();
  const activeOrg = authClient.useActiveOrganization();

  return {
    user: session.data?.user || null,
    household: activeOrg.data || null,
    loading: session.isPending,
    authenticated: !!session.data?.session,
    signOut: authClient.signOut,
    createOrganization: authClient.organization.create,
    setActiveOrganization: authClient.organization.setActive,
  };
}
