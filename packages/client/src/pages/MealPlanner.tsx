import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../hooks/useAuth";

interface Recommendation {
  id: string;
  title: string;
  imageUrl: string | null;
  servings: number;
  tags: string[];
  timesCooked: number;
  lastCookedAt: string | null;
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
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  // Recipe search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const fetchRecommendations = useCallback(async () => {
    try {
      const data = await apiFetch<Recommendation[]>("/plans/current/recommendations");
      setRecommendations(data);
    } catch {
      setRecommendations([]);
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
    fetchPlan().then(() => fetchRecommendations());
  }, [fetchPlan, fetchRecommendations]);

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
      await fetchRecommendations();
    } catch {
      // ignore
    }
  };

  const addRecommendationToPlan = async (rec: Recommendation) => {
    await addRecipeToPlan({ id: rec.id, title: rec.title, servings: rec.servings });
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
      await fetchRecommendations();
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
    return <p className="py-12 text-center text-sm text-gray-400">Laden...</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Weekplanner</h1>
          <p className="text-sm text-gray-500">{getWeekLabel()}</p>
        </div>
      </div>

      {/* Store selector */}
      <div className="mb-4 flex gap-2">
        {STORES.map((s) => (
          <button
            key={s}
            onClick={() => updateStore(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              store === s
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {!plan ? (
        <>
          <div className="py-12 text-center">
            <p className="text-gray-500">Nog geen weekplan.</p>
            <p className="mt-1 text-sm text-gray-400">
              Maak een plan en voeg recepten toe.
            </p>
            <button
              onClick={createPlan}
              disabled={creating}
              className="mt-4 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {creating ? "Bezig..." : "Nieuw weekplan"}
            </button>
          </div>

          {recommendations.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">Suggesties</h2>
              <div className="grid grid-cols-2 gap-2">
                {recommendations.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => navigate(`/recipes/${rec.id}`)}
                    className="flex flex-col rounded-lg border border-gray-200 bg-white p-2 text-left shadow-sm hover:border-green-400 transition"
                  >
                    {rec.imageUrl && (
                      <img
                        src={rec.imageUrl}
                        alt={rec.title}
                        className="mb-2 h-20 w-full rounded object-cover"
                      />
                    )}
                    <span className="text-xs font-medium text-gray-900 line-clamp-2">
                      {rec.title}
                    </span>
                    <span className="mt-1 text-[10px] text-gray-400">
                      {rec.servings} pers.
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Recipes in plan */}
          {plan.recipes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center">
              <p className="text-sm text-gray-500">
                Nog geen recepten toegevoegd.
              </p>
            </div>
          ) : (
            <div className="mb-4 space-y-2">
              {plan.recipes.map((r) => (
                <div
                  key={r.recipeId}
                  className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {r.title}
                    </h3>
                    <button
                      onClick={() => removeRecipeFromPlan(r.recipeId)}
                      className="ml-2 text-gray-400 hover:text-red-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <label className="flex items-center gap-1 text-xs text-gray-500">
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
                        className="w-14 rounded border border-gray-200 px-2 py-0.5 text-center text-xs"
                      />
                    </label>
                    <select
                      value={r.day || ""}
                      onChange={(e) =>
                        updateRecipeInPlan(r.recipeId, {
                          day: e.target.value || null,
                        })
                      }
                      className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600"
                    >
                      <option value="">Geen dag</option>
                      {DAYS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
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
                className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
              {searchResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                  {searchResults.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => addRecipeToPlan(r)}
                      className="flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="text-gray-900">{r.title}</span>
                      <span className="text-xs text-gray-400">
                        {r.servings} pers.
                      </span>
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
                className="mt-2 text-xs text-gray-400 hover:text-gray-600"
              >
                Annuleren
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSearch(true)}
              className="mb-4 w-full rounded-lg border-2 border-dashed border-gray-300 py-2.5 text-sm font-medium text-gray-500 hover:border-green-400 hover:text-green-600"
            >
              + Recept toevoegen
            </button>
          )}

          {/* Generate list button */}
          {plan.recipes.length > 0 && (
            <button
              onClick={generateList}
              disabled={generating}
              className="w-full rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {generating
                ? "Lijst genereren..."
                : "Boodschappenlijst maken"}
            </button>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">Suggesties</h2>
              <div className="grid grid-cols-2 gap-2">
                {recommendations.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => addRecommendationToPlan(rec)}
                    className="flex flex-col rounded-lg border border-gray-200 bg-white p-2 text-left shadow-sm hover:border-green-400 transition"
                  >
                    {rec.imageUrl && (
                      <img
                        src={rec.imageUrl}
                        alt={rec.title}
                        className="mb-2 h-20 w-full rounded object-cover"
                      />
                    )}
                    <span className="text-xs font-medium text-gray-900 line-clamp-2">
                      {rec.title}
                    </span>
                    <span className="mt-1 text-[10px] text-gray-400">
                      {rec.servings} pers.
                      {rec.timesCooked > 0
                        ? ` · ${rec.timesCooked}x gekookt`
                        : " · Nog niet gekookt"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
