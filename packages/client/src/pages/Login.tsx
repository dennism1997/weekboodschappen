import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { authClient } from "../lib/auth-client.js";

type Mode = "login" | "register" | "join" | "setup-passkey";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [invitationId, setInvitationId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, createOrganization, setActiveOrganization } = useAuth();
  const navigate = useNavigate();

  const handlePasskeyLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) throw new Error(String(result.error.message || "Passkey login mislukt"));
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Passkey login mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await authClient.passkey.addPasskey({
        name: "Weekboodschappen",
      });
      if (result?.error) throw new Error(String(result.error.message || "Passkey registreren mislukt"));
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Passkey registreren mislukt");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const result = await signUp({ email, password, name });
        if (result.error) throw new Error(result.error.message || "Registreren mislukt");
        const org = await createOrganization({
          name: householdName,
          slug: crypto.randomUUID().slice(0, 8),
        });
        if (org.error) throw new Error(org.error.message || "Huishouden aanmaken mislukt");
        if (org.data) {
          await setActiveOrganization({ organizationId: org.data.id });
        }
        setMode("setup-passkey");
        setLoading(false);
        return;
      } else if (mode === "join") {
        const result = await signUp({ email, password, name });
        if (result.error) throw new Error(result.error.message || "Registreren mislukt");
        const accept = await authClient.organization.acceptInvitation({ invitationId });
        if (accept.error) throw new Error(accept.error.message || "Uitnodiging accepteren mislukt");
        setMode("setup-passkey");
        setLoading(false);
        return;
      }
    } catch (err: any) {
      setError(err.message || "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "setup-passkey") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ios-bg px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-[34px] font-bold text-ios-label">Passkey instellen</h1>
            <p className="mt-2 text-[13px] text-ios-secondary">
              Stel een passkey in zodat je voortaan snel en veilig kunt inloggen met Face ID, vingerafdruk of je apparaat.
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
          <p className="mt-1 text-[13px] text-ios-secondary">
            {mode === "login" && "Inloggen"}
            {mode === "register" && "Nieuw account aanmaken"}
            {mode === "join" && "Huishouden joinen"}
          </p>
        </div>

        {mode === "login" && (
          <div className="space-y-3">
            <button
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Bezig..." : "Inloggen met passkey"}
            </button>

            {error && <p className="text-center text-[13px] text-ios-destructive">{error}</p>}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-ios-separator" />
              </div>
              <div className="relative flex justify-center text-[13px]">
                <span className="bg-ios-bg px-2 text-ios-secondary">of</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={mode === "login"
          ? async (e) => {
              e.preventDefault();
              setError("");
              setLoading(true);
              try {
                const result = await signIn({ email, password });
                if (result?.error) throw new Error(result.error.message || "Inloggen mislukt");
                navigate("/planner");
              } catch (err: any) {
                setError(err.message || "Inloggen mislukt");
              } finally {
                setLoading(false);
              }
            }
          : handleSubmit
        } className="space-y-3">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Naam huishouden"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              required
              className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
            />
          )}

          {mode === "join" && (
            <input
              type="text"
              placeholder="Uitnodigings-ID"
              value={invitationId}
              onChange={(e) => setInvitationId(e.target.value)}
              required
              className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
            />
          )}

          {(mode === "register" || mode === "join") && (
            <input
              type="text"
              placeholder="Naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
            />
          )}

          <input
            type="email"
            placeholder="E-mailadres"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />

          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />

          {error && mode !== "login" && <p className="text-[13px] text-ios-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className={`w-full rounded-[14px] px-4 py-3 text-[17px] font-semibold disabled:opacity-50 ${
              mode === "login"
                ? "border border-ios-separator text-ios-label"
                : "bg-accent text-white"
            }`}
          >
            {loading
              ? "Even wachten..."
              : mode === "login"
                ? "Inloggen met wachtwoord"
                : mode === "register"
                  ? "Registreren"
                  : "Joinen"}
          </button>
        </form>

        <div className="flex justify-center gap-4 text-[13px] text-ios-secondary">
          {mode !== "login" && (
            <button onClick={() => { setMode("login"); setError(""); }} className="underline">
              Inloggen
            </button>
          )}
          {mode !== "register" && (
            <button onClick={() => { setMode("register"); setError(""); }} className="underline">
              Nieuw account
            </button>
          )}
          {mode !== "join" && (
            <button onClick={() => { setMode("join"); setError(""); }} className="underline">
              Joinen met uitnodiging
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
