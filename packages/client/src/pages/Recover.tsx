import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client.js";

export default function Recover() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);
  const navigate = useNavigate();

  const { data: recovery, isLoading: validating } = useQuery({
    queryKey: ["recovery", token],
    queryFn: async () => {
      const r = await fetch(`/api/recovery/${token}`);
      const data = await r.json();
      if (r.ok && data.valid) {
        return { valid: true as const, userName: data.userName as string };
      }
      return { valid: false as const, error: (data.error || "Ongeldig hersteltoken") as string };
    },
    enabled: !!token,
  });

  const valid = recovery?.valid === true;
  const userName = recovery?.valid ? recovery.userName : "";
  const recoveryError = recovery && !recovery.valid ? recovery.error : "";

  const handleRecover = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/recovery/${token}/redeem`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Herstel mislukt");
      // Activate the organization
      const orgs = await authClient.organization.list();
      if (orgs.data && orgs.data.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs.data[0].id });
      }
      setShowPasskey(true);
    } catch (err: any) {
      setError(err.message || "Herstel mislukt");
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
    return <div className="flex h-screen items-center justify-center text-ios-secondary">Hersteltoken controleren...</div>;
  }

  if (!valid && !showPasskey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Herstel ongeldig</h1>
          <p className="text-[15px] text-ios-secondary">{recoveryError || error}</p>
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
            <h1 className="text-[34px] font-bold text-ios-label">Nieuwe passkey instellen</h1>
            <p className="mt-2 text-[13px] text-ios-secondary">
              Stel een nieuwe passkey in zodat je voortaan snel en veilig kunt inloggen.
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
          <h1 className="text-[34px] font-bold text-ios-label">Account herstellen</h1>
          <p className="mt-2 text-[13px] text-ios-secondary">
            Hoi <span className="font-semibold text-ios-label">{userName}</span>, je huidige passkey wordt verwijderd zodat je een nieuwe kunt instellen.
          </p>
        </div>
        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
        <button
          onClick={handleRecover}
          disabled={loading}
          className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Account herstellen"}
        </button>
      </div>
    </div>
  );
}
