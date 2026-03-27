import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Trash2, Pencil, Plus } from "lucide-react";
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
  rating?: number;
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
  name: string | null;
  displayName: string;
  store: string;
  recipes: PlanRecipe[];
  listId: string | null;
}

interface PlanSummary {
  id: string;
  weekStart: string;
  name: string | null;
  displayName: string;
  store: string;
  status: string;
}

interface SearchResult {
  id: string;
  title: string;
  servings: number;
}

const DAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

function getWeekLabel(weekStart: string): string {
  const monday = new Date(weekStart);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export default function MealPlanner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useAuth();
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Plan rename
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Recipe search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Track which suggestions have been saved as recipes (index → recipeId)
  const [savedSuggestions, setSavedSuggestions] = useState<Record<number, string>>({});

  // Accumulated suggestions (grows with each "load more")
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  // Fetch all plans
  const { data: allPlans = [] } = useQuery({
    queryKey: ["all-plans"],
    queryFn: () => apiFetch<PlanSummary[]>("/plans"),
  });

  // Auto-select the first plan on load
  useEffect(() => {
    if (allPlans.length > 0 && !selectedPlanId) {
      setSelectedPlanId(allPlans[0].id);
    }
  }, [allPlans]);

  // Fetch selected plan with recipes
  const { data: currentPlan = null, isLoading: currentPlanLoading } = useQuery({
    queryKey: ["meal-plan", selectedPlanId],
    queryFn: () => apiFetch<Plan>(`/plans/${selectedPlanId}`),
    enabled: !!selectedPlanId,
  });

  const { data: initialSuggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ["meal-suggestions"],
    queryFn: () => apiFetch<Suggestion[]>("/plans/current/recommendations"),
  });

  // Seed accumulated suggestions from initial load
  useEffect(() => {
    if (initialSuggestions.length > 0 && allSuggestions.length === 0) {
      setAllSuggestions(initialSuggestions);
    }
  }, [initialSuggestions]);

  const loadMoreSuggestions = async () => {
    setLoadingMore(true);
    try {
      const excludeTitles = allSuggestions.map((s) => s.title).join("|");
      const newSuggestions = await apiFetch<Suggestion[]>(
        `/plans/current/recommendations?exclude=${encodeURIComponent(excludeTitles)}`
      );
      setAllSuggestions((prev) => [...prev, ...newSuggestions]);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };


  // Debounce search query
  useEffect(() => {
    if (searchQuery.length < 2) {
      setDebouncedSearchQuery("");
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["recipe-search", debouncedSearchQuery],
    queryFn: () => apiFetch<SearchResult[]>(`/recipes?search=${encodeURIComponent(debouncedSearchQuery)}`),
    enabled: debouncedSearchQuery.length >= 2,
  });

  const invalidatePlans = () => {
    queryClient.invalidateQueries({ queryKey: ["meal-plan", selectedPlanId] });
    queryClient.invalidateQueries({ queryKey: ["all-plans"] });
  };
  const invalidateSuggestions = () => queryClient.invalidateQueries({ queryKey: ["meal-suggestions"] });

  const createPlan = async () => {
    setCreating(true);
    try {
      const newPlan = await apiFetch<Plan>("/plans", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelectedPlanId(newPlan.id);
      await invalidatePlans();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const deletePlan = async () => {
    if (!currentPlan) return;
    const deletedId = currentPlan.id;
    try {
      await apiFetch<{ ok: boolean }>(`/plans/${deletedId}`, { method: "DELETE" });
    } catch (err) {
      console.error("Delete plan failed:", err);
      return;
    }
    setConfirmDelete(false);
    // Select the next available plan (exclude the deleted one)
    const remaining = allPlans.filter((p) => p.id !== deletedId);
    setSelectedPlanId(remaining.length > 0 ? remaining[0].id : null);
    // Remove deleted plan from cache
    queryClient.removeQueries({ queryKey: ["meal-plan", deletedId] });
    queryClient.invalidateQueries({ queryKey: ["all-plans"] });
  };

  const renamePlan = async () => {
    if (!currentPlan) return;
    try {
      await apiFetch(`/plans/${currentPlan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      setEditingName(false);
      await invalidatePlans();
    } catch {
      // ignore
    }
  };

  const addRecipeToPlan = async (recipe: SearchResult) => {
    if (!currentPlan) return;
    try {
      await apiFetch(`/plans/${currentPlan.id}/recipes`, {
        method: "POST",
        body: JSON.stringify({
          recipeId: recipe.id,
          servings: recipe.servings,
        }),
      });
      setShowSearch(false);
      setSearchQuery("");
      setDebouncedSearchQuery("");
      await invalidatePlans();
      await invalidateSuggestions();
    } catch {
      // ignore
    }
  };

  const saveSuggestionAsRecipe = async (rec: Suggestion): Promise<string | null> => {
    try {
      const created = await apiFetch<{ id: string }>("/recipes/from-suggestion", {
        method: "POST",
        body: JSON.stringify({
          title: rec.title,
          description: rec.description,
          ingredients: rec.ingredients,
        }),
      });
      return created.id;
    } catch {
      return null;
    }
  };

  const addSuggestionToPlan = async (rec: Suggestion, index: number) => {
    if (!currentPlan) return;
    let recipeId: string | undefined;

    if (rec.isExisting && rec.existingRecipeId) {
      recipeId = rec.existingRecipeId;
    } else if (savedSuggestions[index]) {
      recipeId = savedSuggestions[index];
    } else {
      const newId = await saveSuggestionAsRecipe(rec);
      if (!newId) return;
      recipeId = newId;
      setSavedSuggestions((prev) => ({ ...prev, [index]: newId }));
    }

    await addRecipeToPlan({ id: recipeId, title: rec.title, servings: 4 });
  };

  const saveToRecipes = async (rec: Suggestion, index: number) => {
    const newId = await saveSuggestionAsRecipe(rec);
    if (newId) {
      setSavedSuggestions((prev) => ({ ...prev, [index]: newId }));
      await invalidateSuggestions();
    }
  };

  const updateRecipeInPlan = async (
    recipeId: string,
    updates: { servings?: number; day?: string | null }
  ) => {
    if (!currentPlan) return;
    try {
      await apiFetch(`/plans/${currentPlan.id}/recipes/${recipeId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      await invalidatePlans();
    } catch {
      // ignore
    }
  };

  const removeRecipeFromPlan = async (recipeId: string) => {
    if (!currentPlan) return;
    try {
      await apiFetch(`/plans/${currentPlan.id}/recipes/${recipeId}`, {
        method: "DELETE",
      });
      await invalidatePlans();
      await invalidateSuggestions();
    } catch {
      // ignore
    }
  };

  const generateList = async () => {
    if (!currentPlan) return;
    setGenerating(true);
    try {
      await apiFetch(`/plans/${currentPlan.id}/generate-list`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      navigate("/list");
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  if (currentPlanLoading) {
    return <p className="py-12 text-center text-[13px] text-ios-secondary">Laden...</p>;
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[34px] font-bold leading-tight text-ios-label">Weekmenu</h1>
      </div>

      {/* Plan selector */}
      {allPlans.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {allPlans.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlanId(p.id)}
                className={`shrink-0 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition ${
                  currentPlan?.id === p.id
                    ? "bg-accent text-white"
                    : "bg-white text-ios-label"
                }`}
              >
                {p.displayName}
              </button>
            ))}
            <button
              onClick={createPlan}
              disabled={creating}
              className="shrink-0 rounded-[10px] bg-white px-3 py-1.5 text-[13px] font-semibold text-accent disabled:opacity-50"
            >
              <Plus className="inline h-3.5 w-3.5" /> Nieuw
            </button>
          </div>
        </div>
      )}

      {!currentPlan ? (
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

          {suggestionsLoading && allSuggestions.length === 0 && (
            <div className="mt-6 py-8 text-center">
              <p className="text-[15px] text-ios-secondary">Suggesties laden...</p>
              <p className="mt-1 text-[13px] text-ios-tertiary">We zoeken recepten voor je</p>
            </div>
          )}

          {allSuggestions.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Suggesties</p>
              <div className="space-y-2">
                {allSuggestions.map((rec, i) => {
                  const isSaved = rec.isExisting || !!savedSuggestions[i];

                  return (
                    <div key={i} className="rounded-[12px] bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
                          {rec.description && (
                            <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
                          )}
                          {rec.rating != null && (
                            <p className="mt-0.5 text-[12px] text-ios-tertiary">
                              {"★".repeat(Math.round(rec.rating))}{"☆".repeat(5 - Math.round(rec.rating))} {rec.rating}/5
                            </p>
                          )}
                          {rec.recipeUrl && (
                            <a href={rec.recipeUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-[12px] text-accent">
                              Bekijk recept →
                            </a>
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
                        <button
                          onClick={() => saveToRecipes(rec, i)}
                          disabled={isSaved}
                          className={`shrink-0 rounded-[8px] p-1.5 ${
                            isSaved
                              ? "bg-accent text-white"
                              : "bg-ios-grouped-bg text-ios-secondary"
                          }`}
                          title={isSaved ? "Opgeslagen in recepten" : "Opslaan in recepten"}
                        >
                          <Bookmark className="h-4 w-4" fill={isSaved ? "currentColor" : "none"} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={loadMoreSuggestions}
                disabled={loadingMore}
                className="mt-2 w-full rounded-[12px] py-3 text-[13px] font-medium text-accent disabled:opacity-50"
              >
                {loadingMore ? "Nieuwe suggesties laden..." : "Meer suggesties"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Plan header with name, date, and actions */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex-1">
              {editingName ? (
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={renamePlan}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renamePlan();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  placeholder={currentPlan.displayName}
                  className="w-full rounded-[8px] border border-ios-separator bg-white px-3 py-1.5 text-[17px] font-semibold text-ios-label focus:border-accent focus:outline-none"
                />
              ) : (
                <div>
                  <button
                    onClick={() => {
                      setNameInput(currentPlan.name || "");
                      setEditingName(true);
                    }}
                    className="flex items-center gap-1.5 text-[17px] font-semibold text-ios-label"
                  >
                    {currentPlan.displayName}
                    <Pencil className="h-3.5 w-3.5 text-ios-tertiary" />
                  </button>
                  <p className="text-[13px] text-ios-secondary">{getWeekLabel(currentPlan.weekStart)}</p>
                </div>
              )}
            </div>
            {!editingName && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-[8px] p-2 text-ios-destructive"
                title="Plan verwijderen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="mb-4 rounded-[12px] border border-ios-destructive/30 bg-ios-destructive/5 p-4">
              <p className="text-[15px] text-ios-label">Weet je zeker dat je dit plan wilt verwijderen?</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={deletePlan}
                  className="rounded-[8px] bg-ios-destructive px-4 py-2 text-[13px] font-semibold text-white"
                >
                  Verwijderen
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-[8px] bg-ios-grouped-bg px-4 py-2 text-[13px] font-semibold text-ios-label"
                >
                  Annuleren
                </button>
              </div>
            </div>
          )}

          {/* Recipes in plan */}
          {currentPlan.recipes.length === 0 ? (
            <div className="rounded-[12px] border-2 border-dashed border-ios-tertiary py-8 text-center">
              <p className="text-[15px] text-ios-secondary">
                Nog geen recepten toegevoegd.
              </p>
            </div>
          ) : (
            <div className="mb-4 overflow-hidden rounded-[12px] bg-white">
              {currentPlan.recipes.map((r, idx) => (
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
                  setDebouncedSearchQuery("");
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
          {currentPlan.recipes.length > 0 && (
            <button
              onClick={generateList}
              disabled={generating}
              className="w-full rounded-[14px] bg-accent py-4 text-[17px] font-semibold text-white disabled:opacity-50"
            >
              {generating ? "Lijst genereren..." : "Boodschappenlijst maken"}
            </button>
          )}

          {/* Suggestions */}
          {suggestionsLoading && allSuggestions.length === 0 && (
            <div className="mt-6 py-8 text-center">
              <p className="text-[15px] text-ios-secondary">Suggesties laden...</p>
              <p className="mt-1 text-[13px] text-ios-tertiary">We zoeken recepten voor je</p>
            </div>
          )}

          {allSuggestions.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Suggesties</p>
              <div className="space-y-2">
                {allSuggestions.map((rec, i) => {
                  const isSaved = rec.isExisting || !!savedSuggestions[i];
                  const alreadyInPlan = currentPlan.recipes.some(
                    (r) => r.recipeId === rec.existingRecipeId || r.recipeId === savedSuggestions[i]
                  );

                  return (
                    <div key={i} className="rounded-[12px] bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
                          {rec.description && (
                            <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
                          )}
                          {rec.rating != null && (
                            <p className="mt-0.5 text-[12px] text-ios-tertiary">
                              {"★".repeat(Math.round(rec.rating))}{"☆".repeat(5 - Math.round(rec.rating))} {rec.rating}/5
                            </p>
                          )}
                          {rec.recipeUrl && (
                            <a href={rec.recipeUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-[12px] text-accent">
                              Bekijk recept →
                            </a>
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
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            onClick={() => saveToRecipes(rec, i)}
                            disabled={isSaved}
                            className={`rounded-[8px] p-1.5 ${
                              isSaved
                                ? "bg-accent text-white"
                                : "bg-ios-grouped-bg text-ios-secondary"
                            }`}
                            title={isSaved ? "Opgeslagen in recepten" : "Opslaan in recepten"}
                          >
                            <Bookmark className="h-4 w-4" fill={isSaved ? "currentColor" : "none"} />
                          </button>
                          {!alreadyInPlan && (
                            <button
                              onClick={() => addSuggestionToPlan(rec, i)}
                              className="rounded-[8px] bg-accent p-1.5 text-white"
                              title="Toevoegen aan weekplan"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={loadMoreSuggestions}
                disabled={loadingMore}
                className="mt-2 w-full rounded-[12px] py-3 text-[13px] font-medium text-accent disabled:opacity-50"
              >
                {loadingMore ? "Nieuwe suggesties laden..." : "Meer suggesties"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
