import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client.js";

export default function Invite() {
  const { token } = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);
  const navigate = useNavigate();

  const { data: invite, isLoading: validating } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const r = await fetch(`/api/invite/${token}`);
      const data = await r.json();
      if (r.ok && data.valid) {
        return { valid: true as const, householdName: data.householdName as string };
      }
      return { valid: false as const, error: (data.error || "Ongeldige uitnodiging") as string };
    },
    enabled: !!token,
  });

  const valid = invite?.valid === true;
  const householdName = invite?.valid ? invite.householdName : "";
  const inviteError = invite && !invite.valid ? invite.error : "";

  const handleAccept = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Joinen mislukt");
      // Activate the organization
      const orgs = await authClient.organization.list();
      if (orgs.data && orgs.data.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs.data[0].id });
      }
      setShowPasskey(true);
    } catch (err: any) {
      setError(err.message || "Joinen mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.passkey.addPasskey({ name: "Weekboodschappen" });
      if (result?.error) throw new Error(String(result.error.message || "Passkey registreren mislukt"));
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Passkey registreren mislukt");
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return <div className="flex h-screen items-center justify-center text-ios-secondary">Uitnodiging controleren...</div>;
  }

  if (!valid && !showPasskey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Uitnodiging ongeldig</h1>
          <p className="text-[15px] text-ios-secondary">{inviteError || error}</p>
          <button
            onClick={() => navigate("/login")}
            className="text-[15px] text-accent underline"
          >
            Naar inloggen
          </button>
        </div>
      </div>
    );
  }

  if (showPasskey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-[34px] font-bold text-ios-label">Passkey instellen</h1>
            <p className="mt-2 text-[13px] text-ios-secondary">
              Stel een passkey in zodat je voortaan snel en veilig kunt inloggen.
            </p>
          </div>
          {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
          <button
            onClick={handleRegisterPasskey}
            disabled={loading}
            className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Passkey registreren"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Weekboodschappen</h1>
          <p className="mt-2 text-[13px] text-ios-secondary">
            Je bent uitgenodigd voor <span className="font-semibold text-ios-label">{householdName}</span>
          </p>
        </div>
        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
        <form onSubmit={handleAccept} className="space-y-3">
          <input
            type="text"
            placeholder="Jouw naam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Joinen"}
          </button>
        </form>
      </div>
    </div>
  );
}
