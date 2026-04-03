import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {Bookmark, Pencil, Plus, RefreshCw, Trash2} from "lucide-react";
import {apiFetch} from "../api/client";
import {useAuth} from "../hooks/useAuth";

interface Suggestion {
  title: string;
  description: string;
  ingredients: string[];
  discountMatches: string[];
  isExisting: boolean;
  existingRecipeId?: string;
  recipeUrl?: string;
  rating?: number;
  source: "eigen" | "website";
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

function getWeekNumber(weekStart: string): number {
  const date = new Date(weekStart);
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  return Math.ceil((days + jan1.getDay() + 1) / 7);
}

function getUpcomingWeeks(count: number): { weekStart: string; label: string }[] {
  const weeks: { weekStart: string; label: string }[] = [];
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    const ws = new Date(monday);
    ws.setDate(monday.getDate() + i * 7);
    const isoDate = ws.toISOString().split("T")[0];
    weeks.push({
      weekStart: isoDate,
      label: `Week ${getWeekNumber(isoDate)} (${getWeekLabel(isoDate)})`,
    });
  }
  return weeks;
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

  // New plan week picker
  const [showWeekPicker, setShowWeekPicker] = useState(false);

  // Week change picker (for existing plan)
  const [showWeekChange, setShowWeekChange] = useState(false);

  // Add-recipe tabs
  const [addTab, setAddTab] = useState<"suggesties" | "eigen">("suggesties");
  const [recipeSearch, setRecipeSearch] = useState("");

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

  // Auto-select the current week's plan on load (fallback to first plan)
  useEffect(() => {
    if (allPlans.length > 0 && !selectedPlanId) {
      const currentWeekStart = getUpcomingWeeks(1)[0]?.weekStart;
      const currentWeekPlan = allPlans.find((p) => p.weekStart === currentWeekStart);
      setSelectedPlanId(currentWeekPlan?.id ?? allPlans[0].id);
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

  const refreshSuggestions = async () => {
    setLoadingMore(true);
    try {
      const newSuggestions = await apiFetch<Suggestion[]>(
        "/plans/current/recommendations/refresh",
        { method: "POST" }
      );
      setAllSuggestions(newSuggestions);
      setSavedSuggestions({});
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMoreSuggestions = async () => {
    setLoadingMore(true);
    try {
      const excludeTitles = allSuggestions.map((s) => s.title);
      const moreSuggestions = await apiFetch<Suggestion[]>(
        "/plans/current/recommendations/more",
        {
          method: "POST",
          body: JSON.stringify({ exclude: excludeTitles }),
        }
      );
      setAllSuggestions((prev) => [...prev, ...moreSuggestions]);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };


  const { data: allOwnRecipes = [] } = useQuery({
    queryKey: ["all-recipes"],
    queryFn: () => apiFetch<SearchResult[]>("/recipes"),
    enabled: addTab === "eigen",
  });

  const filteredOwnRecipes = recipeSearch.trim().length < 2
    ? allOwnRecipes
    : allOwnRecipes.filter((r) => r.title.toLowerCase().includes(recipeSearch.toLowerCase()));

  const invalidatePlans = () => {
    queryClient.invalidateQueries({ queryKey: ["meal-plan", selectedPlanId] });
    queryClient.invalidateQueries({ queryKey: ["all-plans"] });
  };
  const invalidateSuggestions = () => queryClient.invalidateQueries({ queryKey: ["meal-suggestions"] });

  const createPlan = async (weekStart?: string) => {
    setCreating(true);
    setShowWeekPicker(false);
    try {
      const newPlan = await apiFetch<Plan>("/plans", {
        method: "POST",
        body: JSON.stringify(weekStart ? { weekStart } : {}),
      });
      setSelectedPlanId(newPlan.id);
      invalidatePlans();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  // Available weeks for creating a new plan (exclude weeks that already have a plan)
  const existingWeeks = new Set(allPlans.map((p) => p.weekStart));
  const availableWeeks = getUpcomingWeeks(6).filter((w) => !existingWeeks.has(w.weekStart));

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

  const changeWeek = async (newWeekStart: string) => {
    if (!currentPlan) return;
    try {
      await apiFetch(`/plans/${currentPlan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ weekStart: newWeekStart }),
      });
      setShowWeekChange(false);
      await invalidatePlans();
    } catch {
      // ignore
    }
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
      setRecipeSearch("");
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
          recipeUrl: rec.recipeUrl,
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

  const toggleSaveRecipe = async (rec: Suggestion, index: number) => {
    const existingId = rec.existingRecipeId || savedSuggestions[index];
    if (existingId) {
      // Unsave: delete from recipe library
      try {
        await apiFetch(`/recipes/${existingId}`, { method: "DELETE" });
        setSavedSuggestions((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
        invalidateSuggestions();
      } catch {
        // ignore
      }
    } else {
      // Save: create recipe from suggestion
      const newId = await saveSuggestionAsRecipe(rec);
      if (newId) {
        setSavedSuggestions((prev) => ({ ...prev, [index]: newId }));
        invalidateSuggestions();
      }
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
              onClick={() => setShowWeekPicker(!showWeekPicker)}
              disabled={creating || availableWeeks.length === 0}
              className="shrink-0 rounded-[10px] bg-white px-3 py-1.5 text-[13px] font-semibold text-accent disabled:opacity-50"
            >
              <Plus className="inline h-3.5 w-3.5" /> Nieuw
            </button>
          </div>
          {showWeekPicker && availableWeeks.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-[12px] bg-white">
              {availableWeeks.map((w) => (
                <button
                  key={w.weekStart}
                  onClick={() => createPlan(w.weekStart)}
                  className="flex w-full min-h-[44px] items-center px-4 py-3 text-left text-[15px] text-ios-label border-b border-ios-separator/50 last:border-b-0 active:bg-ios-category-bg"
                >
                  {w.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!currentPlan ? (
        <>
          <div className="py-12 text-center">
            <p className="text-[17px] text-ios-secondary">Nog geen weekmenu.</p>
            <p className="mt-1 text-[13px] text-ios-tertiary">
              Maak een menu en voeg recepten toe.
            </p>
            <button
              onClick={() => createPlan()}
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
                          <div className="flex items-center gap-2">
                            <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              rec.source === "eigen" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                            }`}>
                              {rec.source === "eigen" ? "Eigen recept" : "Website"}
                            </span>
                          </div>
                          {rec.description && (
                            <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
                          )}
                          {rec.source === "website" && rec.rating != null && (
                            <p className="mt-0.5 text-[12px] text-ios-tertiary">
                              {"★".repeat(Math.round(rec.rating))}{"☆".repeat(5 - Math.round(rec.rating))} {Math.round(rec.rating * 10) / 10}/5
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
                          onClick={() => toggleSaveRecipe(rec, i)}
                          className={`shrink-0 rounded-[8px] p-1.5 ${
                            isSaved ? "bg-accent text-white" : "bg-ios-grouped-bg text-ios-secondary"
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
              <div className="mt-2 flex gap-2">
                <button
                  onClick={loadMoreSuggestions}
                  disabled={loadingMore}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-3 text-[13px] font-medium text-accent disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {loadingMore ? "Laden..." : "Meer laden"}
                </button>
                <button
                  onClick={refreshSuggestions}
                  disabled={loadingMore}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-3 text-[13px] font-medium text-ios-secondary disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingMore ? "animate-spin" : ""}`} />
                  Vernieuwen
                </button>
              </div>
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
                  <button
                    onClick={() => setShowWeekChange(!showWeekChange)}
                    className="text-[13px] text-ios-secondary underline decoration-ios-tertiary/50 underline-offset-2"
                  >
                    {getWeekLabel(currentPlan.weekStart)}
                  </button>
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

          {/* Week change picker */}
          {showWeekChange && (
            <div className="mb-4 overflow-hidden rounded-[12px] bg-white">
              {getUpcomingWeeks(8)
                .filter((w) => {
                  if (w.weekStart === currentPlan.weekStart) return false;
                  const otherPlans = allPlans.filter((p) => p.id !== currentPlan.id);
                  return !otherPlans.some((p) => p.weekStart === w.weekStart);
                })
                .map((w) => (
                  <button
                    key={w.weekStart}
                    onClick={() => changeWeek(w.weekStart)}
                    className="flex w-full min-h-[44px] items-center px-4 py-3 text-left text-[15px] text-ios-label border-b border-ios-separator/50 last:border-b-0 active:bg-ios-category-bg"
                  >
                    {w.label}
                  </button>
                ))}
            </div>
          )}

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
                    <h3 className="text-[17px] text-ios-label">
                      <button onClick={() => navigate(`/recipes/${r.recipeId}`)} className="text-left text-accent">
                        {r.title}
                      </button>
                    </h3>
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

          {/* Tabs: Suggesties / Eigen recepten */}
          <div className="mt-6">
            <div className="mb-3 flex rounded-[12px] bg-ios-category-bg p-1">
              <button
                onClick={() => setAddTab("suggesties")}
                className={`flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition ${
                  addTab === "suggesties" ? "bg-white text-ios-label shadow-sm" : "text-ios-secondary"
                }`}
              >
                Suggesties
              </button>
              <button
                onClick={() => setAddTab("eigen")}
                className={`flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition ${
                  addTab === "eigen" ? "bg-white text-ios-label shadow-sm" : "text-ios-secondary"
                }`}
              >
                Eigen recepten
              </button>
            </div>

            {addTab === "suggesties" && (
              <>
                {suggestionsLoading && allSuggestions.length === 0 && (
                  <div className="py-8 text-center">
                    <p className="text-[15px] text-ios-secondary">Suggesties laden...</p>
                    <p className="mt-1 text-[13px] text-ios-tertiary">We zoeken recepten voor je</p>
                  </div>
                )}
                {allSuggestions.length > 0 && (
                  <>
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
                                <div className="flex items-center gap-2">
                                  <p className="text-[15px] font-semibold text-ios-label">{rec.title}</p>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    rec.source === "eigen" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                                  }`}>
                                    {rec.source === "eigen" ? "Eigen recept" : "Website"}
                                  </span>
                                </div>
                                {rec.description && (
                                  <p className="mt-0.5 text-[13px] text-ios-secondary">{rec.description}</p>
                                )}
                                {rec.source === "website" && rec.rating != null && (
                                  <p className="mt-0.5 text-[12px] text-ios-tertiary">
                                    {"★".repeat(Math.round(rec.rating))}{"☆".repeat(5 - Math.round(rec.rating))} {Math.round(rec.rating * 10) / 10}/5
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
                                  onClick={() => toggleSaveRecipe(rec, i)}
                                  className={`rounded-[8px] p-1.5 ${isSaved ? "bg-accent text-white" : "bg-ios-grouped-bg text-ios-secondary"}`}
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
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={loadMoreSuggestions}
                        disabled={loadingMore}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-3 text-[13px] font-medium text-accent disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {loadingMore ? "Laden..." : "Meer laden"}
                      </button>
                      <button
                        onClick={refreshSuggestions}
                        disabled={loadingMore}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-3 text-[13px] font-medium text-ios-secondary disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingMore ? "animate-spin" : ""}`} />
                        Vernieuwen
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {addTab === "eigen" && (
              <>
                <input
                  type="search"
                  placeholder="Zoek in je recepten..."
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                  className="mb-3 w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
                />
                {filteredOwnRecipes.length === 0 ? (
                  <p className="py-6 text-center text-[15px] text-ios-secondary">
                    {recipeSearch ? "Geen recepten gevonden." : "Nog geen eigen recepten."}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-[12px] bg-white">
                    {filteredOwnRecipes.map((r, idx) => {
                      const alreadyInPlan = currentPlan.recipes.some((pr) => pr.recipeId === r.id);
                      return (
                        <div
                          key={r.id}
                          className={`flex min-h-[44px] items-center justify-between gap-2 px-4 py-3 ${
                            idx > 0 ? "border-t border-ios-separator" : ""
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] text-ios-label">{r.title}</p>
                            <p className="text-[12px] text-ios-tertiary">{r.servings} personen</p>
                          </div>
                          {alreadyInPlan ? (
                            <span className="text-[12px] font-medium text-ios-tertiary">Toegevoegd</span>
                          ) : (
                            <button
                              onClick={() => addRecipeToPlan(r)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white"
                              title="Toevoegen aan weekplan"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
