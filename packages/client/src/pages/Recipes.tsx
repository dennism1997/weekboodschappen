import {useEffect, useRef, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {apiFetch} from "../api/client.js";
import RecipeCard from "../components/RecipeCard.js";

interface Recipe {
  id: string;
  title: string;
  imageUrl: string | null;
  servings: number;
  tags: string[];
  timesCooked: number;
}

export default function Recipes() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
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

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeError("");
    setScraping(true);
    try {
      await apiFetch("/recipes/scrape", {
        method: "POST",
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      });
      setScrapeUrl("");
      refetch();
    } catch (err: any) {
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
            <RecipeCard key={r.id} {...r} />
          ))}
        </div>
      )}
    </div>
  );
}
