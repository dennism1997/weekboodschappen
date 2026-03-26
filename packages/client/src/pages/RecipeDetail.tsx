import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const fetchPlan = useCallback(async () => {
    try {
      const data = await apiFetch<Plan>("/plans/current");
      setPlan(data);
      if (id && data.recipes.some((r) => r.recipeId === id)) {
        setAdded(true);
      }
    } catch {
      setPlan(null);
    }
  }, [id]);

  useEffect(() => {
    apiFetch<Recipe>(`/recipes/${id}`)
      .then(setRecipe)
      .catch(() => navigate("/recipes"))
      .finally(() => setLoading(false));
    fetchPlan();
  }, [id, navigate, fetchPlan]);

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
        setPlan(newPlan);
      }
      await apiFetch(`/plans/${planId}/recipes`, {
        method: "POST",
        body: JSON.stringify({
          recipeId: recipe.id,
          servings: recipe.servings,
        }),
      });
      setAdded(true);
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
        className="mb-3 text-sm text-green-600"
      >
        &larr; Terug
      </button>

      {recipe.imageUrl && (
        <img
          src={recipe.imageUrl}
          alt={recipe.title}
          className="mb-4 h-48 w-full rounded-xl object-cover"
        />
      )}

      <h1 className="text-xl font-bold text-gray-900">{recipe.title}</h1>

      <div className="mt-2 flex gap-3 text-sm text-gray-500">
        <span>{recipe.servings} personen</span>
        {recipe.prepTimeMinutes && <span>{recipe.prepTimeMinutes} min prep</span>}
        {recipe.cookTimeMinutes && <span>{recipe.cookTimeMinutes} min koken</span>}
      </div>

      {recipe.sourceUrl && (
        <a
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-xs text-green-600 underline"
        >
          Bron bekijken
        </a>
      )}

      <h2 className="mt-6 mb-2 text-lg font-semibold text-gray-900">Ingredienten</h2>
      <ul className="space-y-1">
        {recipe.ingredients.map((ing, i) => (
          <li key={i} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span>{ing.name}</span>
            <span className="text-gray-500">
              {ing.quantity} {ing.unit}
            </span>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 mb-2 text-lg font-semibold text-gray-900">Bereiding</h2>
      <ol className="space-y-3">
        {recipe.instructions.map((step) => (
          <li key={step.step} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700">
              {step.step}
            </span>
            <span className="text-gray-700">{step.text}</span>
          </li>
        ))}
      </ol>

      {added ? (
        <button
          onClick={() => navigate("/planner")}
          className="mt-8 w-full rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-700 border border-green-200"
        >
          ✓ Toegevoegd aan weekplan — Bekijk plan
        </button>
      ) : (
        <button
          onClick={handleAddToPlan}
          disabled={adding}
          className="mt-8 w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {adding ? "Toevoegen..." : "Toevoegen aan weekplan"}
        </button>
      )}

      <button
        onClick={handleDelete}
        className="mt-3 w-full rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        Recept verwijderen
      </button>
    </div>
  );
}
