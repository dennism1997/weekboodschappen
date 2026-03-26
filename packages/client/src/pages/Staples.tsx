import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../api/client";

const CATEGORIES = [
  "Groente & Fruit",
  "Bakkerij & Brood",
  "Vlees & Vis",
  "Kaas & Vleeswaren",
  "Zuivel & Eieren",
  "Kant-en-klaar & Salades",
  "Diepvries",
  "Pasta, Rijst & Wereldkeuken",
  "Soepen, Sauzen & Kruiden",
  "Conserven & Granen",
  "Broodbeleg & Ontbijt",
  "Snoep & Koek",
  "Chips & Noten",
  "Dranken",
  "Koffie & Thee",
  "Huishouden & Schoonmaak",
  "Persoonlijke Verzorging",
  "Baby & Kind",
  "Diervoeding",
  "Overig",
];

interface Staple {
  id: string;
  name: string;
  defaultQuantity: number;
  unit: string;
  category: string;
  active: boolean;
}

export default function Staples() {
  const [staples, setStaples] = useState<Staple[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    quantity: "1",
    unit: "stuk",
    category: "Overig",
  });
  const categoryDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Auto-categorize when name changes
  const autoCategorizeName = (name: string) => {
    if (categoryDebounceRef.current) clearTimeout(categoryDebounceRef.current);
    if (name.trim().length < 2) return;

    categoryDebounceRef.current = setTimeout(async () => {
      try {
        const result = await apiFetch<Record<string, string>>("/recipes/categorize", {
          method: "POST",
          body: JSON.stringify({ ingredients: [name.trim()] }),
        });
        const category = result[name.trim()];
        if (category) {
          setForm((prev) => ({ ...prev, category }));
        }
      } catch {
        // ignore — user can pick manually
      }
    }, 200);
  };

  const fetchStaples = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Staple[]>("/staples");
      setStaples(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStaples();
  }, [fetchStaples]);

  const toggleActive = async (staple: Staple) => {
    // Optimistic update
    setStaples((prev) =>
      prev.map((s) =>
        s.id === staple.id ? { ...s, active: !s.active } : s
      )
    );
    try {
      await apiFetch(`/staples/${staple.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !staple.active }),
      });
    } catch {
      await fetchStaples();
    }
  };

  const addStaple = async () => {
    if (!form.name.trim()) return;
    try {
      await apiFetch("/staples", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          quantity: parseFloat(form.quantity) || 1,
          unit: form.unit,
          category: form.category || "Overig",
        }),
      });
      setForm({ name: "", quantity: "1", unit: "stuk", category: "" });
      await fetchStaples();
    } catch {
      // ignore
    }
  };

  const deleteStaple = async (id: string) => {
    setStaples((prev) => prev.filter((s) => s.id !== id));
    try {
      await apiFetch(`/staples/${id}`, { method: "DELETE" });
    } catch {
      await fetchStaples();
    }
  };

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-400">Laden...</p>;
  }

  const activeStaples = staples.filter((s) => s.active);
  const inactiveStaples = staples.filter((s) => !s.active);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Basisproducten</h1>
        <p className="text-sm text-gray-500">
          Producten die je elke week op de lijst zet.
        </p>
      </div>

      {staples.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-gray-500">Nog geen basisproducten.</p>
          <p className="mt-1 text-sm text-gray-400">
            Voeg hieronder je eerste product toe.
          </p>
        </div>
      ) : (
        <>
          {/* Active staples */}
          {activeStaples.length > 0 && (
            <div className="mb-4">
              {activeStaples.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-b border-gray-100 py-2.5"
                >
                  <button
                    onClick={() => toggleActive(s)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-green-600 bg-green-600"
                  >
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-900">{s.name}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {s.defaultQuantity} {s.unit}
                    </span>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                    {s.category}
                  </span>
                  <button
                    onClick={() => deleteStaple(s.id)}
                    className="text-gray-300 hover:text-red-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Inactive staples */}
          {inactiveStaples.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-300">
                Inactief
              </h3>
              {inactiveStaples.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-b border-gray-50 py-2.5"
                >
                  <button
                    onClick={() => toggleActive(s)}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-gray-300"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-400">{s.name}</span>
                    <span className="ml-2 text-xs text-gray-300">
                      {s.defaultQuantity} {s.unit}
                    </span>
                  </div>
                  <span className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-400">
                    {s.category}
                  </span>
                  <button
                    onClick={() => deleteStaple(s.id)}
                    className="text-gray-300 hover:text-red-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add form */}
      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 text-sm font-medium text-gray-700">
          Product toevoegen
        </h3>
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Naam (bijv. Melk)"
            value={form.name}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              autoCategorizeName(e.target.value);
            }}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Aantal"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-green-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Eenheid"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="w-20 rounded border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-green-500 focus:outline-none"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <button
            onClick={addStaple}
            disabled={!form.name.trim()}
            className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  );
}
