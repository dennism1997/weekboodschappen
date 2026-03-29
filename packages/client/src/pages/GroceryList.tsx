import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {apiFetch} from "../api/client";
import CategoryGroup from "../components/CategoryGroup";
import GroceryItemRow from "../components/GroceryItemRow";

interface DiscountInfo {
  store?: string;
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

const STORES = ["Jumbo", "Albert Heijn"];

export default function GroceryList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [quickAdd, setQuickAdd] = useState("");
  const [store, setStore] = useState("Jumbo");
  const [cleaning, setCleaning] = useState(false);
  const [cleanupSummary, setCleanupSummary] = useState("");
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const [slidingItemId, setSlidingItemId] = useState<string | null>(null);

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

  const deleteList = async () => {
    if (!list) return;
    try {
      await apiFetch(`/lists/${list.id}`, { method: "DELETE" });
      setConfirmDeleteList(false);
      await invalidate();
    } catch {
      // ignore
    }
  };

  const cleanupList = async () => {
    if (!list) return;
    setCleaning(true);
    setCleanupSummary("");
    try {
      const result = await apiFetch<{ summary: string }>(`/lists/${list.id}/cleanup`, {
        method: "POST",
      });
      setCleanupSummary(result.summary);
      await invalidate();
    } catch {
      setCleanupSummary("Opschonen mislukt. Probeer het opnieuw.");
    } finally {
      setCleaning(false);
    }
  };

  const toggleItem = async (itemId: string) => {
    if (!list) return;
    const item = list.items.find((i) => i.id === itemId);
    if (!item) return;

    if (!item.checked) {
      // Animate slide-down, then move to checked section
      setSlidingItemId(itemId);
      // Wait for animation to play before updating data
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Now the sliding class is rendered, wait for the transition
            setTimeout(() => {
              setSlidingItemId(null);
              // Optimistic update
              queryClient.setQueryData<GroceryListData | null>(["grocery-list"], (old) =>
                old ? { ...old, items: old.items.map((i) => (i.id === itemId ? { ...i, checked: true } : i)) } : old,
              );
              resolve();
            }, 250);
          });
        });
      });
    } else {
      // Unchecking — instant, no animation
      queryClient.setQueryData<GroceryListData | null>(["grocery-list"], (old) =>
        old ? { ...old, items: old.items.map((i) => (i.id === itemId ? { ...i, checked: false } : i)) } : old,
      );
    }

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
    if (!list || !quickAdd.trim()) return;
    try {
      await apiFetch(`/lists/${list.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          name: quickAdd.trim(),
          quantity: 1,
          unit: "stuk",
          source: "handmatig",
        }),
      });
      setQuickAdd("");
      await invalidate();
    } catch {
      // ignore
    }
  };

  // Group items by category, unchecked first then checked at the bottom
  const uncheckedItems = (list?.items ?? []).filter((i) => !i.checked);
  const checkedItems = (list?.items ?? []).filter((i) => i.checked);

  const grouped = uncheckedItems.reduce<Record<string, GroceryItem[]>>(
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
  const checkedCount = list.items.filter((i) => i.checked).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[34px] font-bold leading-tight text-ios-label">Boodschappen</h1>
          <p className="text-[13px] text-ios-secondary">
            {checkedCount}/{totalItems} afgevinkt
          </p>
          <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-ios-segmented-bg">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${totalItems > 0 ? (checkedCount / totalItems) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={cleanupList}
            disabled={cleaning}
            className="rounded-[10px] bg-ios-grouped-bg px-3.5 py-2 text-[13px] font-semibold text-ios-label disabled:opacity-50"
          >
            {cleaning ? "Opschonen..." : "✨ Opschonen"}
          </button>
        </div>
      </div>

      {/* Cleanup summary */}
      {cleanupSummary && (
        <div className="mb-4 rounded-[12px] bg-accent-light p-3">
          <p className="text-[13px] text-ios-label">{cleanupSummary}</p>
          <button onClick={() => setCleanupSummary("")} className="mt-1 text-[12px] text-accent">
            Sluiten
          </button>
        </div>
      )}

      {/* Store selector */}
      <div className="mb-4 flex rounded-[9px] bg-ios-segmented-bg p-0.5">
        {STORES.map((s) => (
          <button
            key={s}
            onClick={() => setStore(s)}
            className={`flex-1 rounded-[7px] py-[7px] text-[13px] font-semibold transition ${
              store === s
                ? "bg-white text-ios-label shadow-sm"
                : "text-ios-label"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Quick add input */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Item toevoegen..."
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
          className="min-w-0 flex-1 rounded-[12px] border border-ios-separator bg-white px-4 py-3 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
        />
        {quickAdd.trim() && (
          <button
            onClick={addItem}
            className="shrink-0 rounded-[12px] bg-accent px-4 py-3 text-[15px] font-semibold text-white"
          >
            +
          </button>
        )}
      </div>

      {/* Items by category */}
      {categories.map((cat) => (
        <CategoryGroup key={cat} category={cat} count={grouped[cat].length}>
          {grouped[cat].map((item) => (
            <GroceryItemRow
              key={item.id}
              {...item}
              sliding={slidingItemId === item.id}
              onToggle={toggleItem}
            />
          ))}
        </CategoryGroup>
      ))}

      {/* Checked items at the bottom */}
      {checkedItems.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-ios-tertiary">
            Afgevinkt ({checkedItems.length})
          </p>
          <div className="overflow-hidden rounded-[12px] bg-white opacity-60">
            {checkedItems.map((item) => (
              <GroceryItemRow
                key={item.id}
                {...item}
                onToggle={toggleItem}
              />
            ))}
          </div>
        </div>
      )}

      {/* Start shopping */}
      <button
        onClick={() => navigate("/shop")}
        className="mt-4 w-full rounded-[14px] bg-accent py-4 text-[17px] font-semibold text-white"
      >
        Winkelen starten
      </button>

      {/* Delete list */}
      {confirmDeleteList ? (
        <div className="mt-4 rounded-[12px] border border-ios-destructive/30 bg-ios-destructive/5 p-4">
          <p className="text-[15px] text-ios-label">Weet je zeker dat je de hele lijst wilt verwijderen?</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={deleteList}
              className="rounded-[8px] bg-ios-destructive px-4 py-2 text-[13px] font-semibold text-white"
            >
              Verwijderen
            </button>
            <button
              onClick={() => setConfirmDeleteList(false)}
              className="rounded-[8px] bg-ios-grouped-bg px-4 py-2 text-[13px] font-semibold text-ios-label"
            >
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDeleteList(true)}
          className="mt-3 w-full rounded-[14px] border border-ios-destructive py-3 text-[15px] font-medium text-ios-destructive"
        >
          Lijst verwijderen
        </button>
      )}
    </div>
  );
}
