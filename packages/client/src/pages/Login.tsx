import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";

export default function Login() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsSetup) navigate("/setup", { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [navigate]);

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
      </div>
    </div>
  );
}
