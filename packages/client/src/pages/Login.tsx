import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client.js";

export default function Login() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const navigate = useNavigate();

  const { isLoading: checking } = useQuery({
    queryKey: ["setup-status"],
    queryFn: async () => {
      const r = await fetch("/api/setup/status");
      return r.json() as Promise<{ needsSetup: boolean }>;
    },
    select(data) {
      if (data.needsSetup) navigate("/setup", { replace: true });
      return data;
    },
  });

  if (checking) {
    return <div className="flex h-screen items-center justify-center text-ios-secondary">Laden...</div>;
  }

  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) throw new Error(String(result.error.message || "Passkey login mislukt"));
      const orgs = await authClient.organization.list();
      if (orgs.data && orgs.data.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs.data[0].id });
      }
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Passkey login mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryCode = async () => {
    const code = recoveryCode.trim();
    if (!code) return;
    setError("");
    setRecoveryLoading(true);
    try {
      const r = await fetch(`/api/recovery/${encodeURIComponent(code)}`);
      const data = await r.json();
      if (!r.ok || !data.valid) throw new Error(data.error || "Ongeldige herstelcode");
      navigate(`/recover/${encodeURIComponent(code)}`);
    } catch (err: any) {
      setError(err.message || "Ongeldige herstelcode");
    } finally {
      setRecoveryLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Weekboodschappen</h1>
          <p className="mt-1 text-[13px] text-ios-secondary">Inloggen</p>
        </div>

        <button
          onClick={handlePasskeyLogin}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Inloggen met passkey"}
        </button>

        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}

        {showRecovery ? (
          <div className="space-y-3">
            <input
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="Herstelcode (bijv. a1b2c3-d4e5f6-a7b8c9)"
              className="w-full rounded-[12px] bg-ios-grouped-bg px-4 py-3 text-center font-mono text-[15px] text-ios-label placeholder:text-ios-secondary"
            />
            <button
              onClick={handleRecoveryCode}
              disabled={recoveryLoading}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {recoveryLoading ? "Bezig..." : "Herstellen"}
            </button>
            <button
              onClick={() => {
                setShowRecovery(false);
                setRecoveryCode("");
                setError("");
              }}
              className="w-full rounded-[14px] px-4 py-3 text-[15px] text-ios-secondary"
            >
              Annuleren
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowRecovery(true)}
            className="w-full text-center text-[13px] text-ios-secondary"
          >
            Passkey verloren? Gebruik herstelcode
          </button>
        )}

        <button
          onClick={() => navigate("/register")}
          className="w-full text-center text-[13px] text-accent"
        >
          Nog geen account? Toegang aanvragen
        </button>
      </div>
    </div>
  );
}
