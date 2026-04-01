import {useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {apiFetch} from "../api/client";

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
  frequencyWeeks: number;
}

export default function Staples() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    quantity: "1",
    unit: "stuk",
    category: "Overig",
    frequencyWeeks: "1",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: "1", frequencyWeeks: "1" });
  const categoryDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const { data: staples = [], isLoading: loading } = useQuery({
    queryKey: ["staples"],
    queryFn: () => apiFetch<Staple[]>("/staples"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["staples"] });

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

  const toggleActive = async (staple: Staple) => {
    // Optimistic update
    queryClient.setQueryData<Staple[]>(["staples"], (old) =>
      old?.map((s) => (s.id === staple.id ? { ...s, active: !s.active } : s)),
    );
    try {
      await apiFetch(`/staples/${staple.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !staple.active }),
      });
    } catch {
      await invalidate();
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
          frequencyWeeks: parseInt(form.frequencyWeeks) || 1,
        }),
      });
      setForm({ name: "", quantity: "1", unit: "stuk", category: "", frequencyWeeks: "1" });
      await invalidate();
    } catch {
      // ignore
    }
  };

  const startEditing = (s: Staple) => {
    setEditingId(s.id);
    setEditForm({ quantity: String(s.defaultQuantity), frequencyWeeks: String(s.frequencyWeeks) });
  };

  const saveEdit = async (id: string) => {
    const quantity = parseFloat(editForm.quantity) || 1;
    const frequencyWeeks = parseInt(editForm.frequencyWeeks) || 1;
    queryClient.setQueryData<Staple[]>(["staples"], (old) =>
      old?.map((s) => s.id === id ? { ...s, defaultQuantity: quantity, frequencyWeeks } : s),
    );
    setEditingId(null);
    try {
      await apiFetch(`/staples/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, frequencyWeeks }),
      });
    } catch {
      await invalidate();
    }
  };

  const deleteStaple = async (id: string) => {
    queryClient.setQueryData<Staple[]>(["staples"], (old) =>
      old?.filter((s) => s.id !== id),
    );
    try {
      await apiFetch(`/staples/${id}`, { method: "DELETE" });
    } catch {
      await invalidate();
    }
  };

  if (loading) {
    return <p className="py-12 text-center text-[13px] text-ios-secondary">Laden...</p>;
  }

  const activeStaples = staples.filter((s) => s.active);
  const inactiveStaples = staples.filter((s) => !s.active);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[34px] font-bold text-ios-label">Basisproducten</h1>
        <p className="text-[13px] text-ios-secondary">
          Producten die je elke week op de lijst zet.
        </p>
      </div>

      {staples.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[17px] text-ios-secondary">Nog geen basisproducten.</p>
          <p className="mt-1 text-[13px] text-ios-tertiary">
            Voeg hieronder je eerste product toe.
          </p>
        </div>
      ) : (
        <>
          {activeStaples.length > 0 && (
            <div className="mb-4 overflow-hidden rounded-[12px] bg-white">
              {activeStaples.map((s, idx) => (
                <div
                  key={s.id}
                  className={`px-4 py-3 ${idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""}`}
                >
                  <div className="flex min-h-[44px] items-center gap-3">
                    <button
                      onClick={() => toggleActive(s)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-accent bg-accent"
                    >
                      <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button className="flex-1 min-w-0 text-left" onClick={() => editingId === s.id ? setEditingId(null) : startEditing(s)}>
                      <span className="text-[17px] text-ios-label">{s.name}</span>
                      <span className="ml-2 text-[13px] text-ios-secondary">
                        {s.defaultQuantity} {s.unit}
                      </span>
                      {s.frequencyWeeks > 1 && (
                        <span className="ml-1 text-[11px] text-ios-tertiary">
                          · elke {s.frequencyWeeks} wkn
                        </span>
                      )}
                    </button>
                    <span className="rounded-full bg-ios-category-bg px-2 py-0.5 text-[10px] text-ios-secondary">
                      {s.category}
                    </span>
                    <button onClick={() => deleteStaple(s.id)} className="text-ios-tertiary">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  {editingId === s.id && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        value={editForm.quantity}
                        onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                        className="w-20 rounded-[8px] border border-ios-separator px-2 py-2 text-center text-[13px] text-ios-label focus:border-accent focus:outline-none"
                      />
                      <span className="self-center text-[13px] text-ios-secondary">{s.unit}</span>
                      <select
                        value={editForm.frequencyWeeks}
                        onChange={(e) => setEditForm((f) => ({ ...f, frequencyWeeks: e.target.value }))}
                        className="flex-1 rounded-[8px] border border-ios-separator px-2 py-2 text-[13px] text-ios-label focus:border-accent focus:outline-none"
                      >
                        <option value="1">Elke week</option>
                        <option value="2">Elke 2 weken</option>
                        <option value="3">Elke 3 weken</option>
                        <option value="4">Elke 4 weken</option>
                      </select>
                      <button
                        onClick={() => saveEdit(s.id)}
                        className="rounded-[8px] bg-accent px-3 py-2 text-[13px] font-semibold text-white"
                      >
                        Opslaan
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {inactiveStaples.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-tertiary">
                Inactief
              </p>
              <div className="overflow-hidden rounded-[12px] bg-white">
                {inactiveStaples.map((s, idx) => (
                  <div
                    key={s.id}
                    className={`px-4 py-3 ${idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""}`}
                  >
                    <div className="flex min-h-[44px] items-center gap-3">
                      <button
                        onClick={() => toggleActive(s)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ios-tertiary"
                      />
                      <button className="flex-1 min-w-0 text-left" onClick={() => editingId === s.id ? setEditingId(null) : startEditing(s)}>
                        <span className="text-[15px] text-ios-tertiary">{s.name}</span>
                        <span className="ml-2 text-[13px] text-ios-tertiary">
                          {s.defaultQuantity} {s.unit}
                        </span>
                        {s.frequencyWeeks > 1 && (
                          <span className="ml-1 text-[11px] text-ios-tertiary">
                            · elke {s.frequencyWeeks} wkn
                          </span>
                        )}
                      </button>
                      <span className="rounded-full bg-ios-category-bg px-2 py-0.5 text-[10px] text-ios-tertiary">
                        {s.category}
                      </span>
                      <button onClick={() => deleteStaple(s.id)} className="text-ios-tertiary">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    {editingId === s.id && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="number"
                          value={editForm.quantity}
                          onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                          className="w-20 rounded-[8px] border border-ios-separator px-2 py-2 text-center text-[13px] text-ios-label focus:border-accent focus:outline-none"
                        />
                        <span className="self-center text-[13px] text-ios-secondary">{s.unit}</span>
                        <select
                          value={editForm.frequencyWeeks}
                          onChange={(e) => setEditForm((f) => ({ ...f, frequencyWeeks: e.target.value }))}
                          className="flex-1 rounded-[8px] border border-ios-separator px-2 py-2 text-[13px] text-ios-label focus:border-accent focus:outline-none"
                        >
                          <option value="1">Elke week</option>
                          <option value="2">Elke 2 weken</option>
                          <option value="3">Elke 3 weken</option>
                          <option value="4">Elke 4 weken</option>
                        </select>
                        <button
                          onClick={() => saveEdit(s.id)}
                          className="rounded-[8px] bg-accent px-3 py-2 text-[13px] font-semibold text-white"
                        >
                          Opslaan
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add form */}
      <div className="mt-4 overflow-hidden rounded-[12px] bg-white p-4">
        <h3 className="mb-3 text-[15px] font-semibold text-ios-label">
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
            className="w-full rounded-[8px] border border-ios-separator px-3 py-2.5 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Aantal"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="w-20 rounded-[8px] border border-ios-separator px-2 py-2.5 text-center text-[13px] text-ios-label focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              placeholder="Eenheid"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="w-20 rounded-[8px] border border-ios-separator px-2 py-2.5 text-center text-[13px] text-ios-label focus:border-accent focus:outline-none"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="flex-1 rounded-[8px] border border-ios-separator px-2 py-2.5 text-[13px] text-ios-label focus:border-accent focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <select
            value={form.frequencyWeeks}
            onChange={(e) => setForm({ ...form, frequencyWeeks: e.target.value })}
            className="w-full rounded-[8px] border border-ios-separator px-3 py-2.5 text-[13px] text-ios-label focus:border-accent focus:outline-none"
          >
            <option value="1">Elke week</option>
            <option value="2">Elke 2 weken</option>
            <option value="3">Elke 3 weken</option>
            <option value="4">Elke 4 weken</option>
          </select>
          <button
            onClick={addStaple}
            disabled={!form.name.trim()}
            className="w-full rounded-[14px] bg-accent py-3 text-[15px] font-semibold text-white disabled:opacity-50"
          >
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  );
}
