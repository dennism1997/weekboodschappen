import { useState } from "react";
import { apiFetch } from "../api/client.js";

interface ScrapeDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ScrapeDialog({ open, onClose, onSaved }: ScrapeDialogProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/recipes/scrape", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      setUrl("");
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || "Kon recept niet ophalen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-gray-900">Recept toevoegen</h2>
        <form onSubmit={handleScrape} className="space-y-4">
          <input
            type="url"
            placeholder="Plak een recept-URL..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            autoFocus
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? "Ophalen..." : "Recept ophalen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
