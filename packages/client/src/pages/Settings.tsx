import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { apiFetch } from "../api/client";
import { authClient } from "../lib/auth-client";

interface Member {
  id: string;
  name: string;
}

const STORES = ["Jumbo", "Albert Heijn"];

export default function Settings() {
  const { user, household, signOut } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [store, setStore] = useState("Jumbo");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchMembers() {
      if (!household) return;
      try {
        const result = await authClient.organization.getFullOrganization();
        if (result.data) {
          setMembers(
            result.data.members.map((m: any) => ({
              id: m.user.id,
              name: m.user.name || m.user.email,
            })),
          );
        }
      } catch {
        // ignore
      }
    }
    fetchMembers();
  }, [household]);

  const updateStore = async (newStore: string) => {
    setStore(newStore);
    try {
      await apiFetch("/household", {
        method: "PATCH",
        body: JSON.stringify({ preferredStore: newStore }),
      });
    } catch {
      // ignore
    }
  };

  const copyInviteLink = async () => {
    if (!household?.slug) return;
    try {
      await navigator.clipboard.writeText(household.slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-gray-900">Instellingen</h1>

      {/* Household info */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Huishouden
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Naam</span>
            <span className="font-medium text-gray-900">
              {household?.name || "\u2014"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Uitnodiging</span>
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
            >
              {household?.slug || "\u2014"}
              <span className="text-[10px] text-gray-400">
                {copied ? "Gekopieerd!" : "Kopieer"}
              </span>
            </button>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Ingelogd als</span>
            <span className="font-medium text-gray-900">
              {user?.name || user?.email || "\u2014"}
            </span>
          </div>
        </div>
      </section>

      {/* Preferred store */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Voorkeurswinkel
        </h2>
        <div className="flex gap-2">
          {STORES.map((s) => (
            <button
              key={s}
              onClick={() => updateStore(s)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                store === s
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Members */}
      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Leden</h2>
        {members.length === 0 ? (
          <p className="text-sm text-gray-400">Laden...</p>
        ) : (
          <ul className="space-y-1">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-700">
                  {m.name.charAt(0).toUpperCase()}
                </span>
                {m.name}
                {m.id === user?.id && (
                  <span className="text-xs text-gray-400">(jij)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Category ordering placeholder */}
      <section className="mb-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <p className="text-center text-sm text-gray-400">
          Binnenkort: categorievolgorde aanpassen
        </p>
      </section>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Uitloggen
      </button>
    </div>
  );
}
