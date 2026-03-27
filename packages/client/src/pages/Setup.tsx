import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";

export default function Setup() {
  const [name, setName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showPasskey, setShowPasskey] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data) => {
        if (!data.needsSetup) navigate("/login", { replace: true });
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [navigate]);

  const handleSetup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, householdName }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup mislukt");
      // Activate the newly created organization
      const orgs = await authClient.organization.list();
      if (orgs.data && orgs.data.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs.data[0].id });
      }
      setShowPasskey(true);
    } catch (err: any) {
      setError(err.message || "Setup mislukt");
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

  if (checking) {
    return <div className="flex h-screen items-center justify-center text-ios-secondary">Laden...</div>;
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
          <button
            onClick={() => navigate("/planner")}
            className="w-full text-center text-[13px] text-ios-secondary"
          >
            Later instellen
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
          <p className="mt-2 text-[13px] text-ios-secondary">Welkom! Stel je huishouden in.</p>
        </div>
        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
        <form onSubmit={handleSetup} className="space-y-3">
          <input
            type="text"
            placeholder="Jouw naam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          <input
            type="text"
            placeholder="Naam huishouden"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Starten"}
          </button>
        </form>
      </div>
    </div>
  );
}
