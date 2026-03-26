import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../api/client.js";
import RecipeCard from "../components/RecipeCard.js";
import ScrapeDialog from "../components/ScrapeDialog.js";

interface Recipe {
  id: string;
  title: string;
  imageUrl: string | null;
  servings: number;
  tags: string[];
  timesCooked: number;
}

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [search, setSearch] = useState("");
  const [showScrape, setShowScrape] = useState(false);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchRecipes = async (query?: string) => {
    setLoading(true);
    try {
      const params = query ? `?search=${encodeURIComponent(query)}` : "";
      const data = await apiFetch<Recipe[]>(`/recipes${params}`);
      setRecipes(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchRecipes();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchRecipes(search || undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Recepten</h1>
        <button
          onClick={() => setShowScrape(true)}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          + Toevoegen
        </button>
      </div>

      <input
        type="search"
        placeholder="Zoek recepten..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
      />

      {loading ? (
        <p className="text-center text-sm text-gray-400">Laden...</p>
      ) : recipes.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-500">Nog geen recepten.</p>
          <p className="mt-1 text-sm text-gray-400">
            Voeg een recept toe via een URL.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {recipes.map((r) => (
            <RecipeCard key={r.id} {...r} />
          ))}
        </div>
      )}

      <ScrapeDialog
        open={showScrape}
        onClose={() => setShowScrape(false)}
        onSaved={fetchRecipes}
      />
    </div>
  );
}
