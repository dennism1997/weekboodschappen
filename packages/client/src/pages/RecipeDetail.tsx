import { useState, useEffect } from "react";
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

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<Recipe>(`/recipes/${id}`)
      .then(setRecipe)
      .catch(() => navigate("/recipes"))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) return <p className="text-center text-gray-400">Laden...</p>;
  if (!recipe) return null;

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

      <button
        onClick={handleDelete}
        className="mt-8 w-full rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        Recept verwijderen
      </button>
    </div>
  );
}
