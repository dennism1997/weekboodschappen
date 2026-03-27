import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import CategoryGroup from "../components/CategoryGroup";
import GroceryItemRow from "../components/GroceryItemRow";

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
  planId: string;
  items: GroceryItem[];
}

interface Plan {
  id: string;
  listId: string | null;
}

export default function GroceryList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", quantity: "1", unit: "stuk" });

  const { data: list = null, isLoading: loading } = useQuery({
    queryKey: ["grocery-list"],
    queryFn: async () => {
      const plan = await apiFetch<Plan>("/plans/current");
      if (plan.listId) {
        return apiFetch<GroceryListData>(`/lists/${plan.listId}`);
      }
      return null;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["grocery-list"] });

  const toggleItem = async (itemId: string) => {
    if (!list) return;
    const item = list.items.find((i) => i.id === itemId);
    if (!item) return;
    // Optimistic update
    queryClient.setQueryData<GroceryListData | null>(["grocery-list"], (old) =>
      old ? { ...old, items: old.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)) } : old,
    );
    try {
      await apiFetch(`/lists/${list.id}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ checked: !item.checked }),
      });
    } catch {
      await invalidate();
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
      await invalidate();
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
    return <p className="py-12 text-center text-[13px] text-ios-secondary">Laden...</p>;
  }

  if (!list) {
    return (
      <div>
        <h1 className="text-[34px] font-bold text-ios-label">Boodschappen</h1>
        <div className="py-12 text-center">
          <p className="text-[17px] text-ios-secondary">Geen boodschappenlijst gevonden.</p>
          <p className="mt-1 text-[13px] text-ios-tertiary">
            Maak eerst een weekplan en genereer een lijst.
          </p>
          <button
            onClick={() => navigate("/planner")}
            className="mt-4 rounded-[14px] bg-accent px-5 py-3 text-[17px] font-semibold text-white"
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
          <h1 className="text-[34px] font-bold leading-tight text-ios-label">Boodschappen</h1>
          <p className="text-[13px] text-ios-secondary">
            {checkedItems}/{totalItems} afgevinkt
          </p>
          <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-ios-segmented-bg">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${totalItems > 0 ? (checkedItems / totalItems) * 100 : 0}%` }}
            />
          </div>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-white"
        >
          + Item
        </button>
      </div>

      {/* Add item form */}
      {showAdd && (
        <div className="mb-4 overflow-hidden rounded-[12px] bg-white p-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Product naam"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              autoFocus
              className="flex-1 rounded-[8px] border border-ios-separator px-3 py-2 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
            />
            <input
              type="number"
              value={newItem.quantity}
              onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
              className="w-16 rounded-[8px] border border-ios-separator px-2 py-2 text-center text-[15px] text-ios-label focus:border-accent focus:outline-none"
            />
            <input
              type="text"
              value={newItem.unit}
              onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
              className="w-16 rounded-[8px] border border-ios-separator px-2 py-2 text-center text-[15px] text-ios-label focus:border-accent focus:outline-none"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="text-[13px] text-ios-secondary"
            >
              Annuleren
            </button>
            <button
              onClick={addItem}
              className="rounded-[8px] bg-accent px-4 py-1.5 text-[13px] font-semibold text-white"
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
        className="mt-4 w-full rounded-[14px] bg-accent py-4 text-[17px] font-semibold text-white"
      >
        Winkelen starten
      </button>
    </div>
  );
}
