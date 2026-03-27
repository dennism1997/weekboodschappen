import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import DiscountBadge from "../components/DiscountBadge";

interface DiscountInfo {
  percentage: number;
  originalPrice: number;
  salePrice: number;
}

interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  source: "recept" | "basis" | "handmatig";
  checked: boolean;
  discountInfo?: DiscountInfo | null;
}

interface GroceryListData {
  id: string;
  items: GroceryItem[];
}

interface Plan {
  id: string;
  listId: string | null;
}

export default function ShoppingMode() {
  const navigate = useNavigate();
  const [list, setList] = useState<GroceryListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addText, setAddText] = useState("");

  const fetchList = useCallback(async () => {
    try {
      const plan = await apiFetch<Plan>("/plans/current");
      if (plan.listId) {
        const data = await apiFetch<GroceryListData>(`/lists/${plan.listId}`);
        setList(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const toggleItem = async (itemId: string) => {
    if (!list) return;
    const item = list.items.find((i) => i.id === itemId);
    if (!item) return;
    setList({
      ...list,
      items: list.items.map((i) =>
        i.id === itemId ? { ...i, checked: !i.checked } : i
      ),
    });
    try {
      await apiFetch(`/lists/${list.id}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ checked: !item.checked }),
      });
    } catch {
      await fetchList();
    }
  };

  const addItem = async () => {
    if (!list || !addText.trim()) return;
    try {
      await apiFetch(`/lists/${list.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          name: addText.trim(),
          quantity: 1,
          unit: "stuk",
          source: "handmatig",
        }),
      });
      setAddText("");
      await fetchList();
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white text-sm text-gray-400">
        Laden...
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white px-4">
        <p className="text-gray-500">Geen boodschappenlijst gevonden.</p>
        <button
          onClick={() => navigate("/list")}
          className="mt-4 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Terug naar lijst
        </button>
      </div>
    );
  }

  const unchecked = list.items.filter((i) => !i.checked);
  const checked = list.items.filter((i) => i.checked);
  const total = list.items.length;
  const done = checked.length;
  const progress = total > 0 ? (done / total) * 100 : 0;

  // Group unchecked by category
  const grouped = unchecked.reduce<Record<string, GroceryItem[]>>((acc, item) => {
    const cat = item.category || "Overig";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 pb-3 pt-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            onClick={() => navigate("/list")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <div className="flex items-center justify-between text-sm font-medium text-gray-700">
              <span>Winkelen</span>
              <span>
                {done}/{total} items
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-green-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 pb-32">
        <div className="mx-auto max-w-lg">
          {categories.map((cat) => (
            <div key={cat} className="mt-4">
              <div className="sticky top-0 z-10 bg-white py-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  {cat}
                </h3>
              </div>
              {grouped[cat].map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full items-center gap-3 border-b border-gray-50 py-3 text-left active:bg-gray-50"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-300" />
                  <span className="flex-1 text-base text-gray-900">
                    {item.name}
                  </span>
                  <DiscountBadge discountInfo={item.discountInfo ?? null} />
                  <span className="text-sm text-gray-400">
                    {item.quantity} {item.unit}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {/* Checked items */}
          {checked.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-300">
                Afgevinkt ({checked.length})
              </h3>
              {checked.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className="flex w-full items-center gap-3 border-b border-gray-50 py-2 text-left"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-green-600 bg-green-600">
                    <svg
                      className="h-3.5 w-3.5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <span className="flex-1 text-sm text-gray-400 line-through">
                    {item.name}
                  </span>
                  <span className="text-xs text-gray-300 line-through">
                    {item.quantity} {item.unit}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-4 pb-6 pt-3">
        <div className="mx-auto max-w-lg space-y-2">
          {/* Quick add */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Item toevoegen..."
              value={addText}
              onChange={(e) => setAddText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
            <button
              onClick={addItem}
              disabled={!addText.trim()}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              +
            </button>
          </div>

          {/* Finish button */}
          {done === total && total > 0 && (
            <button
              onClick={() => navigate("/list")}
              className="w-full rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700"
            >
              Klaar met winkelen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
