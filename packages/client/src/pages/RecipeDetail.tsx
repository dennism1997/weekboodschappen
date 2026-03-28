import {useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {apiFetch} from "../api/client.js";

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  category: string;
}

interface Instruction {
  step: number;
  text: string;
}

interface Recipe {
  id: string;
  title: string;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
  tags: string[];
  timesCooked: number;
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

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [addedToPlanId, setAddedToPlanId] = useState<string | null>(null);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: recipe = null, isLoading: loading } = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => apiFetch<Recipe>(`/recipes/${id}`),
    enabled: !!id,
  });

  const { data: allPlans = [] } = useQuery({
    queryKey: ["all-plans"],
    queryFn: () => apiFetch<PlanSummary[]>("/plans"),
  });

  if (loading) return <p className="text-center text-gray-400">Laden...</p>;
  if (!recipe) return null;

  const handleAddToPlan = async (planId: string) => {
    if (!recipe) return;
    setAdding(true);
    setShowWeekPicker(false);
    try {
      await apiFetch(`/plans/${planId}/recipes`, {
        method: "POST",
        body: JSON.stringify({
          recipeId: recipe.id,
          servings: recipe.servings,
        }),
      });
      setAddedToPlanId(planId);
      queryClient.invalidateQueries({ queryKey: ["all-plans"] });
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const handleAddToNewWeek = async (weekStart: string) => {
    if (!recipe) return;
    setAdding(true);
    setShowWeekPicker(false);
    try {
      const newPlan = await apiFetch<PlanDetail>("/plans", {
        method: "POST",
        body: JSON.stringify({ weekStart }),
      });
      await apiFetch(`/plans/${newPlan.id}/recipes`, {
        method: "POST",
        body: JSON.stringify({
          recipeId: recipe.id,
          servings: recipe.servings,
        }),
      });
      setAddedToPlanId(newPlan.id);
      queryClient.invalidateQueries({ queryKey: ["all-plans"] });
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  // Weeks that don't have a plan yet (for creating new plans)
  const existingWeeks = new Set(allPlans.map((p) => p.weekStart));
  const availableNewWeeks = getUpcomingWeeks(6).filter((w) => !existingWeeks.has(w.weekStart));

  const handleDelete = async () => {
    try {
      await apiFetch(`/recipes/${id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      navigate("/recipes");
    } catch (err) {
      console.error("Delete recipe failed:", err);
    }
  };

  return (
    <div>
      <button
        onClick={() => navigate("/recipes")}
        className="mb-3 text-[15px] text-accent"
      >
        &larr; Terug
      </button>

      {recipe.imageUrl && (
        <img
          src={recipe.imageUrl}
          alt={recipe.title}
          className="mb-4 h-48 w-full rounded-[12px] object-cover"
        />
      )}

      <h1 className="text-[34px] font-bold leading-tight text-ios-label">{recipe.title}</h1>

      <div className="mt-2 flex gap-3 text-[13px] text-ios-secondary">
        <span>{recipe.servings} personen</span>
        {recipe.prepTimeMinutes && <span>{recipe.prepTimeMinutes} min prep</span>}
        {recipe.cookTimeMinutes && <span>{recipe.cookTimeMinutes} min koken</span>}
      </div>

      {recipe.sourceUrl && (
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-[13px] text-accent underline"
        >
          Bron bekijken
        </a>
      )}

      <p className="mt-6 mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Ingredienten</p>
      <div className="overflow-hidden rounded-[12px] bg-white">
        {recipe.ingredients.map((ing, i) => (
          <div key={i} className={`flex min-h-[44px] items-center justify-between px-4 py-3 ${
            i > 0 ? "ml-4 border-t border-ios-separator pl-0" : ""
          }`}>
            <span className="text-[17px] text-ios-label">{ing.name}</span>
            <span className="text-[13px] text-ios-secondary">
              {ing.quantity} {ing.unit}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Bereiding</p>
      <ol className="space-y-3">
        {recipe.instructions.map((step) => (
          <li key={step.step} className="flex gap-3 text-[15px]">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-light text-[12px] font-semibold text-accent">
              {step.step}
            </span>
            <span className="text-ios-label">{step.text}</span>
          </li>
        ))}
      </ol>

      {addedToPlanId ? (
        <button
          onClick={() => navigate("/planner")}
          className="mt-8 w-full rounded-[14px] border border-accent bg-accent-light px-4 py-3 text-[15px] font-semibold text-accent"
        >
          Toegevoegd — Bekijk weekplan
        </button>
      ) : showWeekPicker ? (
        <div className="mt-8">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">Kies een week</p>
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
            {availableNewWeeks.map((w) => (
              <button
                key={w.weekStart}
                onClick={() => handleAddToNewWeek(w.weekStart)}
                disabled={adding}
                className={`flex w-full min-h-[44px] items-center px-4 py-3 text-left text-[15px] text-accent active:bg-ios-category-bg disabled:opacity-50 border-t border-ios-separator/50`}
              >
                + {w.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowWeekPicker(false)}
            className="mt-2 w-full py-2 text-[13px] text-ios-secondary"
          >
            Annuleren
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowWeekPicker(true)}
          disabled={adding}
          className="mt-8 w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {adding ? "Toevoegen..." : "Toevoegen aan weekplan"}
        </button>
      )}

      {confirmDelete ? (
        <div className="mt-3 rounded-[12px] border border-ios-destructive/30 bg-ios-destructive/5 p-4">
          <p className="text-[15px] text-ios-label">Weet je zeker dat je dit recept wilt verwijderen?</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleDelete}
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
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="mt-3 w-full rounded-[14px] border border-ios-destructive px-4 py-3 text-[15px] font-medium text-ios-destructive"
        >
          Recept verwijderen
        </button>
      )}
    </div>
  );
}
