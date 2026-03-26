import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { authClient } from "../lib/auth-client.js";

type Mode = "login" | "register" | "join";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const result = await signIn({ email, password });
        if (result.error) throw new Error(result.error.message || "Inloggen mislukt");
      } else if (mode === "register") {
        // Sign up, then create an organization (household)
        const result = await signUp({ email, password, name });
        if (result.error) throw new Error(result.error.message || "Registreren mislukt");
        const org = await createOrganization({ name: householdName, slug: crypto.randomUUID().slice(0, 8) });
        if (org.error) throw new Error(org.error.message || "Huishouden aanmaken mislukt");
        if (org.data) {
          await setActiveOrganization({ organizationId: org.data.id });
        }
      } else {
        // Join mode: sign up then accept invitation
        const result = await signUp({ email, password, name });
        if (result.error) throw new Error(result.error.message || "Registreren mislukt");
        const accept = await authClient.organization.acceptInvitation({ invitationId });
        if (accept.error) throw new Error(accept.error.message || "Uitnodiging accepteren mislukt");
      }
      navigate("/planner");
    } catch (err: any) {
      setError(err.message || "Er ging iets mis");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-700">Weekboodschappen</h1>
          <p className="mt-1 text-sm text-gray-500">
            {mode === "login" && "Inloggen"}
            {mode === "register" && "Nieuw huishouden aanmaken"}
            {mode === "join" && "Huishouden joinen"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <input
              type="text"
              placeholder="Naam huishouden"
              value={householdName}
              onChange={(e) => setHouseholdName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          )}

          {mode === "join" && (
            <input
              type="text"
              placeholder="Uitnodigings-ID"
              value={invitationId}
              onChange={(e) => setInvitationId(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          )}

          {(mode === "register" || mode === "join") && (
            <input
              type="text"
              placeholder="Naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          )}

          <input
            type="email"
            placeholder="E-mailadres"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />

          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {loading
              ? "Even wachten..."
              : mode === "login"
                ? "Inloggen"
                : mode === "register"
                  ? "Registreren"
                  : "Joinen"}
          </button>
        </form>

        <div className="flex justify-center gap-4 text-xs text-gray-500">
          {mode !== "login" && (
            <button onClick={() => setMode("login")} className="underline">
              Inloggen
            </button>
          )}
          {mode !== "register" && (
            <button onClick={() => setMode("register")} className="underline">
              Nieuw huishouden
            </button>
          )}
          {mode !== "join" && (
            <button onClick={() => setMode("join")} className="underline">
              Joinen met code
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
