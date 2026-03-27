import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client.js";

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

interface Plan {
  id: string;
  recipes: { recipeId: string }[];
}

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const { data: recipe = null, isLoading: loading } = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => apiFetch<Recipe>(`/recipes/${id}`),
    enabled: !!id,
  });

  const { data: plan = null } = useQuery({
    queryKey: ["current-plan-for-recipe", id],
    queryFn: async () => {
      const data = await apiFetch<Plan>("/plans/current");
      if (id && data.recipes.some((r) => r.recipeId === id)) {
        setAdded(true);
      }
      return data;
    },
    enabled: !!id,
  });

  if (loading) return <p className="text-center text-gray-400">Laden...</p>;
  if (!recipe) return null;

  const handleAddToPlan = async () => {
    if (!recipe) return;
    setAdding(true);
    try {
      let planId = plan?.id;
      if (!planId) {
        const newPlan = await apiFetch<Plan>("/plans", {
          method: "POST",
          body: JSON.stringify({ store: "Jumbo" }),
        });
        planId = newPlan.id;
      }
      await apiFetch(`/plans/${planId}/recipes`, {
        method: "POST",
        body: JSON.stringify({
          recipeId: recipe.id,
          servings: recipe.servings,
        }),
      });
      setAdded(true);
      queryClient.invalidateQueries({ queryKey: ["current-plan-for-recipe"] });
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Weet je zeker dat je dit recept wilt verwijderen?")) return;
    await apiFetch(`/recipes/${id}`, { method: "DELETE" });
    navigate("/recipes");
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

      {added ? (
        <button
          onClick={() => navigate("/planner")}
          className="mt-8 w-full rounded-[14px] border border-accent bg-accent-light px-4 py-3 text-[15px] font-semibold text-accent"
        >
          ✓ Toegevoegd aan weekplan — Bekijk plan
        </button>
      ) : (
        <button
          onClick={handleAddToPlan}
          disabled={adding}
          className="mt-8 w-full rounded-[14px] bg-accent px-4 py-4 text-[17px] font-semibold text-white disabled:opacity-50"
        >
          {adding ? "Toevoegen..." : "Toevoegen aan weekplan"}
        </button>
      )}

      <button
        onClick={handleDelete}
        className="mt-3 w-full rounded-[14px] border border-ios-destructive px-4 py-3 text-[15px] font-medium text-ios-destructive"
      >
        Recept verwijderen
      </button>
    </div>
  );
}
