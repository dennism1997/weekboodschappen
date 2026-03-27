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
        <h1 className="text-[34px] font-bold text-ios-label">Recepten</h1>
        <button
          onClick={() => setShowScrape(true)}
          className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-white"
        >
          + Toevoegen
        </button>
      </div>

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
