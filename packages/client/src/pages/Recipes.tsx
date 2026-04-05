import {useEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {usePostHog} from "@posthog/react";
import {apiFetch} from "../api/client.js";
import RecipeCard from "../components/RecipeCard.js";

interface Recipe {
  id: string;
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number;
  tags: string[];
  timesCooked: number;
  status: "ready" | "pending" | "failed";
}

interface PlanSummary {
  id: string;
  weekStart: string;
  displayName: string;
}

interface PlanDetail {
  id: string;
  recipes: { recipeId: string }[];
}

function getWeekNumber(weekStart: string): number {
  const date = new Date(weekStart);
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  return Math.ceil((days + jan1.getDay() + 1) / 7);
}

function getWeekLabel(weekStart: string): string {
  const monday = new Date(weekStart);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
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
    weeks.push({ weekStart: isoDate, label: `Week ${getWeekNumber(isoDate)} (${getWeekLabel(isoDate)})` });
  }
  return weeks;
}

export default function Recipes() {
  const queryClient = useQueryClient();
  const posthog = usePostHog();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [addingRecipeId, setAddingRecipeId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addedRecipeIds, setAddedRecipeIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const { data: recipes = [], isLoading: loading, refetch } = useQuery({
    queryKey: ["recipes", debouncedSearch],
    queryFn: async () => {
      const params = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : "";
      return apiFetch<Recipe[]>(`/recipes${params}`);
    },
  });

  const { data: allPlans = [] } = useQuery({
    queryKey: ["all-plans"],
    queryFn: () => apiFetch<PlanSummary[]>("/plans"),
  });

  const existingWeeks = new Set(allPlans.map((p) => p.weekStart));
  const availableNewWeeks = getUpcomingWeeks(6).filter((w) => !existingWeeks.has(w.weekStart));

  const handleAddToPlan = async (planId: string) => {
    if (!addingRecipeId) return;
    const recipe = recipes.find((r) => r.id === addingRecipeId);
    if (!recipe) return;
    setAdding(true);
    setAddingRecipeId(null);
    try {
      await apiFetch(`/plans/${planId}/recipes`, {
        method: "POST",
        body: JSON.stringify({ recipeId: recipe.id, servings: recipe.servings }),
      });
      setAddedRecipeIds((prev) => new Set(prev).add(recipe.id));
      queryClient.invalidateQueries({ queryKey: ["all-plans"] });
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const handleAddToNewWeek = async (weekStart: string) => {
    if (!addingRecipeId) return;
    const recipe = recipes.find((r) => r.id === addingRecipeId);
    if (!recipe) return;
    setAdding(true);
    setAddingRecipeId(null);
    try {
      const newPlan = await apiFetch<PlanDetail>("/plans", {
        method: "POST",
        body: JSON.stringify({ weekStart }),
      });
      await apiFetch(`/plans/${newPlan.id}/recipes`, {
        method: "POST",
        body: JSON.stringify({ recipeId: recipe.id, servings: recipe.servings }),
      });
      setAddedRecipeIds((prev) => new Set(prev).add(recipe.id));
      queryClient.invalidateQueries({ queryKey: ["all-plans"] });
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeError("");
    setScraping(true);
    try {
      await apiFetch("/recipes/scrape", {
        method: "POST",
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });
      posthog.capture("recipe_scraped", { url: scrapeUrl.trim() });
      setScrapeUrl("");
      refetch();
    } catch (err: any) {
      posthog.captureException(err);
      setScrapeError(err.message || "Kon recept niet ophalen");
    } finally {
      setScraping(false);
    }
  };

  return (
    <div>
      <h1 className="mb-4 text-[34px] font-bold text-ios-label">Recepten</h1>

      {/* Scrape URL input */}
      <div className="mb-3">
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="Plak een recept-URL om toe te voegen..."
            value={scrapeUrl}
            onChange={(e) => { setScrapeUrl(e.target.value); setScrapeError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleScrape(); }}
            className="min-w-0 flex-1 rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
          />
          {scrapeUrl.trim() && (
            <button
              onClick={handleScrape}
              disabled={scraping}
              className="shrink-0 rounded-[12px] bg-accent px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {scraping ? "..." : "+"}
            </button>
          )}
        </div>
        {scrapeError && (
          <p className="mt-1 px-1 text-[13px] text-ios-destructive">{scrapeError}</p>
        )}
      </div>

      {/* Search */}
      <input
        type="search"
        placeholder="Zoek recepten..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[17px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
      />

      {loading ? (
        <p className="text-center text-[13px] text-ios-secondary">Laden...</p>
      ) : recipes.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[17px] text-ios-secondary">Nog geen recepten.</p>
          <p className="mt-1 text-[13px] text-ios-tertiary">
            Plak een recept-URL hierboven om te beginnen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {recipes.map((r) => (
            <RecipeCard
              key={r.id}
              {...r}
              onAdd={() => setAddingRecipeId(r.id)}
            />
          ))}
        </div>
      )}

      {/* Weekkiezer modal */}
      {addingRecipeId && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setAddingRecipeId(null)}>
          <div className="w-full rounded-t-[20px] bg-ios-grouped-bg p-4 pb-8" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">
              Toevoegen aan weekplan
            </p>
            <div className="overflow-hidden rounded-[12px] bg-white">
              {allPlans.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => handleAddToPlan(p.id)}
                  disabled={adding}
                  className={`flex w-full min-h-[44px] items-center px-4 py-3 text-left text-[15px] text-ios-label active:bg-ios-category-bg disabled:opacity-50 ${
                    idx > 0 ? "border-t border-ios-separator/50" : ""
                  }`}
                >
                  {p.displayName}
                </button>
              ))}
              {availableNewWeeks.map((w, idx) => (
                <button
                  key={w.weekStart}
                  onClick={() => handleAddToNewWeek(w.weekStart)}
                  disabled={adding}
                  className={`flex w-full min-h-[44px] items-center px-4 py-3 text-left text-[15px] text-accent active:bg-ios-category-bg disabled:opacity-50 border-t border-ios-separator/50 ${
                    allPlans.length === 0 && idx === 0 ? "border-t-0" : ""
                  }`}
                >
                  + {w.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAddingRecipeId(null)}
              className="mt-2 w-full py-2 text-[13px] text-ios-secondary"
            >
              Annuleren
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
