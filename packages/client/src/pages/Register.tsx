import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";

export default function Register() {
  const [name, setName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "passkey">("form");
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!name.trim() || !householdName.trim()) {
      setError("Vul alle velden in");
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Create user + waiting household
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), householdName: householdName.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registratie mislukt");

      // Set active organization
      const orgs = await authClient.organization.list();
      if (orgs.data && orgs.data.length > 0) {
        await authClient.organization.setActive({ organizationId: orgs.data[0].id });
      }

      setStep("passkey");
    } catch (err: any) {
      setError(err.message || "Registratie mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeySetup = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.passkey.addPasskey();
      if (result?.error) throw new Error(String(result.error.message || "Passkey instellen mislukt"));
      navigate("/waiting");
    } catch (err: any) {
      setError(err.message || "Passkey instellen mislukt");
      // Still navigate to waiting — they can set up passkey later via recovery
      navigate("/waiting");
    } finally {
      setLoading(false);
    }
  };

  if (step === "passkey") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-[22px] font-bold text-ios-label">Passkey instellen</h1>
            <p className="mt-2 text-[15px] text-ios-secondary">
              Stel een passkey in zodat je later kunt inloggen.
            </p>
          </div>

          <button
            onClick={handlePasskeySetup}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Bezig..." : "Passkey instellen"}
          </button>

          {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-[34px] font-bold text-ios-label">Weekboodschappen</h1>
          <p className="mt-1 text-[13px] text-ios-secondary">Toegang aanvragen</p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Je naam"
            className="w-full rounded-[12px] bg-ios-grouped-bg px-4 py-3 text-[15px] text-ios-label placeholder:text-ios-secondary"
          />
          <input
            type="text"
            value={householdName}
            onChange={(e) => setHouseholdName(e.target.value)}
            placeholder="Naam van je huishouden"
            className="w-full rounded-[12px] bg-ios-grouped-bg px-4 py-3 text-[15px] text-ios-label placeholder:text-ios-secondary"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Bezig..." : "Aanvragen"}
        </button>

        {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}

        <button
          onClick={() => navigate("/login")}
          className="w-full text-center text-[13px] text-ios-secondary"
        >
          Al een account? Inloggen
        </button>
      </div>
    </div>
  );
}
