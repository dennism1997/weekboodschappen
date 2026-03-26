import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

type Mode = "login" | "register" | "join";

export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register, join } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(userName, password);
      } else if (mode === "register") {
        await register(householdName, userName, password);
      } else {
        await join(inviteCode, userName, password);
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
              placeholder="Uitnodigingscode"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          )}

          <input
            type="text"
            placeholder="Gebruikersnaam"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
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
