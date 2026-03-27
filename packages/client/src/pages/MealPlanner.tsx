import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../hooks/useAuth";

interface Suggestion {
  title: string;
  description: string;
  ingredients: string[];
  discountMatches: string[];
  isExisting: boolean;
  existingRecipeId?: string;
  recipeUrl?: string;
}

interface PlanRecipe {
  recipeId: string;
  title: string;
  servings: number;
  day: string | null;
}

interface Plan {
  id: string;
  weekStart: string;
  store: string;
  recipes: PlanRecipe[];
  listId: string | null;
}

interface SearchResult {
  id: string;
  title: string;
  servings: number;
}

const DAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const STORES = ["Jumbo", "Albert Heijn"];

function getWeekLabel(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default function MealPlanner() {
  const navigate = useNavigate();
  useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [store, setStore] = useState("Jumbo");
  const [recommendations, setSuggestions] = useState<Suggestion[]>([]);

  // Recipe search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    try {
      const data = await apiFetch<Suggestion[]>("/plans/current/recommendations");
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Plan>("/plans/current");
      setPlan(data);
      if (data.store) setStore(data.store);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan().then(() => fetchSuggestions());
  }, [fetchPlan, fetchSuggestions]);

  // Store preference is set when the plan is fetched or when the user selects one

  const createPlan = async () => {
    setCreating(true);
    try {
      const data = await apiFetch<Plan>("/plans", {
        method: "POST",
        body: JSON.stringify({ store }),
      });
      setPlan(data);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  // Debounced recipe search
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<SearchResult[]>(
          `/recipes?search=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const addRecipeToPlan = async (recipe: SearchResult) => {
    if (!plan) return;
    try {
      await apiFetch(`/plans/${plan.id}/recipes`, {
        method: "POST",
        body: JSON.stringify({
          recipeId: recipe.id,
          servings: recipe.servings,
        }),
      });
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
      await fetchPlan();
      await fetchSuggestions();
    } catch {
      // ignore
    }
  };

  const addSuggestionToPlan = async (rec: Suggestion) => {
    if (rec.isExisting && rec.existingRecipeId) {
      await addRecipeToPlan({ id: rec.existingRecipeId, title: rec.title, servings: 4 });
    }
  };

  const updateRecipeInPlan = async (
    recipeId: string,
    updates: { servings?: number; day?: string | null }
  ) => {
    if (!plan) return;
    try {
      await apiFetch(`/plans/${plan.id}/recipes/${recipeId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      await fetchPlan();
    } catch {
      // ignore
    }
  };

  const removeRecipeFromPlan = async (recipeId: string) => {
    if (!plan) return;
    try {
      await apiFetch(`/plans/${plan.id}/recipes/${recipeId}`, {
        method: "DELETE",
      });
      await fetchPlan();
      await fetchSuggestions();
    } catch {
      // ignore
    }
  };

  const generateList = async () => {
    if (!plan) return;
    setGenerating(true);
    try {
      await apiFetch(`/plans/${plan.id}/generate-list`, {
        method: "POST",
        body: JSON.stringify({ store }),
      });
      navigate("/list");
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const updateStore = async (newStore: string) => {
    setStore(newStore);
    if (plan) {
      try {
        await apiFetch(`/plans/${plan.id}`, {
          method: "PATCH",
          body: JSON.stringify({ store: newStore }),
        });
      } catch {
        // ignore
      }
    }
  };

  if (loading) {
    return <p className="py-12 text-center text-[13px] text-ios-secondary">Laden...</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[34px] font-bold leading-tight text-ios-label">Weekplanner</h1>
        <p className="text-[13px] text-ios-secondary">{getWeekLabel()}</p>
      </div>

      {/* Store selector — iOS segmented control */}
      <div className="mb-5 flex rounded-[9px] bg-ios-segmented-bg p-0.5">
        {STORES.map((s) => (
          <button
            key={s}
            onClick={() => updateStore(s)}
            className={`flex-1 rounded-[7px] py-[7px] text-[13px] font-semibold transition ${
              store === s
                ? "bg-white text-ios-label shadow-sm"
                : "text-ios-label"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {!plan ? (
        <>
          <div className="py-12 text-center">
            <p className="text-[17px] text-ios-secondary">Nog geen weekplan.</p>
            <p className="mt-1 text-[13px] text-ios-tertiary">
              Maak een plan en voeg recepten toe.
            </p>
            <button
              onClick={createPlan}
              disabled={creating}
              className="mt-4 rounded-[14px] bg-accent px-5 py-3 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {creating ? "Bezig..." : "Nieuw weekplan"}
            </button>
          </div>

          {recommendations.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Suggesties</p>
              <div className="space-y-2">
                {recommendations.map((rec, i) => (
                  <div key={i} className="rounded-[12px] bg-white p-4">
                    <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
                    {rec.description && (
                      <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
                    )}
                    {rec.discountMatches.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {rec.discountMatches.map((d, j) => (
                          <span key={j} className="rounded-[4px] bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">
                            korting: {d}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Recipes in plan */}
          {plan.recipes.length === 0 ? (
            <div className="rounded-[12px] border-2 border-dashed border-ios-tertiary py-8 text-center">
              <p className="text-[15px] text-ios-secondary">
                Nog geen recepten toegevoegd.
              </p>
            </div>
          ) : (
            <div className="mb-4 overflow-hidden rounded-[12px] bg-white">
              {plan.recipes.map((r, idx) => (
                <div
                  key={r.recipeId}
                  className={`flex min-h-[44px] items-center justify-between px-4 py-3 ${
                    idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
                  }`}
                >
                  <div>
                    <h3 className="text-[17px] text-ios-label">{r.title}</h3>
                    <div className="mt-0.5 flex items-center gap-3 text-[13px] text-ios-secondary">
                      <label className="flex items-center gap-1">
                        <span>Porties:</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={r.servings}
                          onChange={(e) =>
                            updateRecipeInPlan(r.recipeId, {
                              servings: parseInt(e.target.value) || 1,
                            })
                          }
                          className="w-12 rounded-[8px] border border-ios-separator px-2 py-0.5 text-center text-[13px] text-ios-label"
                        />
                      </label>
                      <select
                        value={r.day || ""}
                        onChange={(e) =>
                          updateRecipeInPlan(r.recipeId, {
                            day: e.target.value || null,
                          })
                        }
                        className="rounded-[8px] border border-ios-separator px-2 py-0.5 text-[13px] text-ios-secondary"
                      >
                        <option value="">Geen dag</option>
                        {DAYS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.day && (
                      <span className="rounded-[6px] bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
                        {r.day}
                      </span>
                    )}
                    <button
                      onClick={() => removeRecipeFromPlan(r.recipeId)}
                      className="text-ios-destructive"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add recipe */}
          {showSearch ? (
            <div className="mb-4">
              <input
                type="search"
                placeholder="Zoek een recept..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="mb-2 w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
              />
              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-[12px] bg-white">
                  {searchResults.map((r, idx) => (
                    <button
                      key={r.id}
                      onClick={() => addRecipeToPlan(r)}
                      className={`flex w-full min-h-[44px] items-center justify-between px-4 py-3 text-left ${
                        idx > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
                      }`}
                    >
                      <span className="text-[17px] text-ios-label">{r.title}</span>
                      <span className="text-[13px] text-ios-secondary">{r.servings} pers.</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }}
                className="mt-2 text-[13px] text-ios-secondary"
              >
                Annuleren
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="mb-4 w-full rounded-[12px] border-2 border-dashed border-ios-tertiary py-3 text-[15px] font-medium text-accent"
            >
              + Recept toevoegen
            </button>
          )}

          {/* Generate list button */}
          {plan.recipes.length > 0 && (
            <button
              onClick={generateList}
              disabled={generating}
              className="w-full rounded-[14px] bg-accent py-4 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {generating ? "Lijst genereren..." : "Boodschappenlijst maken"}
            </button>
          )}

          {/* Suggestions */}
          {recommendations.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Suggesties</p>
              <div className="space-y-2">
                {recommendations.map((rec, i) => (
                  <div key={i} className="rounded-[12px] bg-white p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
                        {rec.description && (
                          <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
                        )}
                        {rec.discountMatches.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {rec.discountMatches.map((d, j) => (
                              <span key={j} className="rounded-[4px] bg-accent-light px-2 py-0.5 text-[11px] font-semibold text-accent">
                                korting: {d}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {rec.isExisting && rec.existingRecipeId && (
                        <button
                          onClick={() => addSuggestionToPlan(rec)}
                          className="ml-2 shrink-0 rounded-[8px] bg-accent px-3 py-1.5 text-[13px] font-semibold text-white"
                        >
                          + Plan
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
