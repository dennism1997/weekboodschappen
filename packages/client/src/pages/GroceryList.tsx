import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import CategoryGroup from "../components/CategoryGroup";
import GroceryItemRow from "../components/GroceryItemRow";

interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  source: "recept" | "basis" | "handmatig";
  checked: boolean;
}

interface GroceryListData {
  id: string;
  planId: string;
  items: GroceryItem[];
}

interface Plan {
  id: string;
  listId: string | null;
}

export default function GroceryList() {
  const navigate = useNavigate();
  const [list, setList] = useState<GroceryListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", quantity: "1", unit: "stuk" });

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      // First get current plan to find list ID
      const plan = await apiFetch<Plan>("/plans/current");
      if (plan.listId) {
        const data = await apiFetch<GroceryListData>(`/lists/${plan.listId}`);
        setList(data);
      } else {
        setList(null);
      }
    } catch {
      setList(null);
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
    // Optimistic update
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
      // Revert on error
      await fetchList();
    }
  };

  const addItem = async () => {
    if (!list || !newItem.name.trim()) return;
    try {
      await apiFetch(`/lists/${list.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          name: newItem.name.trim(),
          quantity: parseFloat(newItem.quantity) || 1,
          unit: newItem.unit,
          source: "handmatig",
        }),
      });
      setNewItem({ name: "", quantity: "1", unit: "stuk" });
      setShowAdd(false);
      await fetchList();
    } catch {
      // ignore
    }
  };

  // Group items by category
  const grouped = (list?.items ?? []).reduce<Record<string, GroceryItem[]>>(
    (acc, item) => {
      const cat = item.category || "Overig";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    },
    {}
  );
  const categories = Object.keys(grouped).sort();

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-400">Laden...</p>;
  }

  if (!list) {
    return (
      <div>
        <h1 className="text-xl font-bold text-gray-900">Boodschappenlijst</h1>
        <div className="py-12 text-center">
          <p className="text-gray-500">Geen boodschappenlijst gevonden.</p>
          <p className="mt-1 text-sm text-gray-400">
            Maak eerst een weekplan en genereer een lijst.
          </p>
          <button
            onClick={() => navigate("/planner")}
            className="mt-4 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Naar weekplanner
          </button>
        </div>
      </div>
    );
  }

  const totalItems = list.items.length;
  const checkedItems = list.items.filter((i) => i.checked).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Boodschappenlijst</h1>
          <p className="text-xs text-gray-500">
            {checkedItems}/{totalItems} afgevinkt
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
        >
          + Item toevoegen
        </button>
      </div>

      {/* Add item form */}
      {showAdd && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Product naam"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              autoFocus
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-green-500 focus:outline-none"
            />
            <input
              type="number"
              value={newItem.quantity}
              onChange={(e) =>
                setNewItem({ ...newItem, quantity: e.target.value })
              }
              className="w-16 rounded border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-green-500 focus:outline-none"
            />
            <input
              type="text"
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              className="w-16 rounded border border-gray-300 px-2 py-1.5 text-center text-sm focus:border-green-500 focus:outline-none"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Annuleren
            </button>
            <button
              onClick={addItem}
              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
            >
              Toevoegen
            </button>
          </div>
        </div>
      )}

      {/* Items by category */}
      {categories.map((cat) => (
        <CategoryGroup key={cat} category={cat} count={grouped[cat].length}>
          {grouped[cat].map((item) => (
            <GroceryItemRow
              key={item.id}
              {...item}
              onToggle={toggleItem}
            />
          ))}
        </CategoryGroup>
      ))}

      {/* Start shopping */}
      <button
        onClick={() => navigate("/shop")}
        className="mt-4 w-full rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700"
      >
        Winkelen starten
      </button>
    </div>
  );
}
