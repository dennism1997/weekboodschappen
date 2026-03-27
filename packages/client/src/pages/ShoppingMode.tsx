import {useCallback, useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {apiFetch} from "../api/client";
import {useOfflineQueue} from "../hooks/useOfflineQueue";
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
    const [finalizing, setFinalizing] = useState(false);
    const {enqueue, isOnline} = useOfflineQueue();

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
                i.id === itemId ? {...i, checked: !i.checked} : i
            ),
        });
        const url = `/lists/${list.id}/items/${itemId}`;
        const body = JSON.stringify({checked: !item.checked});
        if (!isOnline) {
            enqueue(url, "PATCH", body);
            return;
        }
        try {
            await apiFetch(url, {method: "PATCH", body});
        } catch {
            await fetchList();
        }
    };

    const addItem = async () => {
        if (!list || !addText.trim()) return;
        const url = `/lists/${list.id}/items`;
        const body = JSON.stringify({
            name: addText.trim(),
            quantity: 1,
            unit: "stuk",
            source: "handmatig",
        });
        if (!isOnline) {
            enqueue(url, "POST", body);
            // Optimistically add to local state
            const tempItem: GroceryItem = {
                id: crypto.randomUUID(),
                name: addText.trim(),
                quantity: 1,
                unit: "stuk",
                category: "Overig",
                source: "handmatig",
                checked: false,
            };
            setList({...list, items: [...list.items, tempItem]});
            setAddText("");
            return;
        }
        try {
            await apiFetch(url, {method: "POST", body});
            setAddText("");
            await fetchList();
        } catch {
            // ignore
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-white text-[15px] text-ios-secondary">
                Laden...
            </div>
        );
    }

    if (!list) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-white px-4">
                <p className="text-[17px] text-ios-secondary">Geen boodschappenlijst gevonden.</p>
                <button
                    onClick={() => navigate("/list")}
                    className="mt-4 rounded-[14px] bg-accent px-5 py-3 text-[17px] font-semibold text-white"
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

    const grouped = unchecked.reduce<Record<string, GroceryItem[]>>((acc, item) => {
        const cat = item.category || "Overig";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {});
    const categories = Object.keys(grouped).sort();

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
            {/* Offline indicator */}
            {!isOnline && (
                <div className="bg-[#FFCC00] px-4 py-2 text-center text-[13px] font-semibold text-[#1D1D1F]">
                    Offline — wijzigingen worden opgeslagen
                </div>
            )}

            {/* Header */}
            <div className="border-b border-ios-separator bg-[rgba(249,249,249,0.94)] px-4 pb-3 pt-4 backdrop-blur-[20px]">
                <div className="mx-auto flex max-w-lg items-center gap-3">
                    <button
                        onClick={() => navigate("/list")}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-ios-secondary"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
                        </svg>
                    </button>
                    <div className="flex-1">
                        <div className="flex items-center justify-between text-[15px] font-semibold text-ios-label">
                            <span>Winkelen</span>
                            <span className="text-[13px] font-normal text-ios-secondary">
                                {done}/{total} items
                            </span>
                        </div>
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ios-segmented-bg">
                            <div
                                className="h-full rounded-full bg-accent transition-all duration-300"
                                style={{width: `${progress}%`}}
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
                                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ios-secondary">
                                    {cat}
                                </h3>
                            </div>
                            {grouped[cat].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => toggleItem(item.id)}
                                    className="flex w-full min-h-[44px] items-center gap-3 border-b border-ios-separator/30 py-3 text-left active:bg-ios-category-bg"
                                >
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ios-tertiary"/>
                                    <span className="flex-1 text-[17px] text-ios-label">
                                        {item.name}
                                    </span>
                                    <DiscountBadge discountInfo={item.discountInfo ?? null}/>
                                    <span className="text-[13px] text-ios-secondary">
                                        {item.quantity} {item.unit}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ))}

                    {/* Checked items */}
                    {checked.length > 0 && (
                        <div className="mt-6">
                            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-tertiary">
                                Afgevinkt ({checked.length})
                            </h3>
                            {checked.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => toggleItem(item.id)}
                                    className="flex w-full min-h-[44px] items-center gap-3 border-b border-ios-separator/20 py-2 text-left"
                                >
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-accent bg-accent">
                                        <svg
                                            className="h-3.5 w-3.5 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={3}
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                                        </svg>
                                    </div>
                                    <span className="flex-1 text-[15px] text-ios-tertiary line-through">
                                        {item.name}
                                    </span>
                                    <span className="text-[13px] text-ios-tertiary line-through">
                                        {item.quantity} {item.unit}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom bar */}
            <div className="fixed inset-x-0 bottom-0 border-t border-ios-separator bg-[rgba(249,249,249,0.94)] px-4 pb-6 pt-3 backdrop-blur-[20px]">
                <div className="mx-auto max-w-lg space-y-2">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Item toevoegen..."
                            value={addText}
                            onChange={(e) => setAddText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addItem()}
                            className="flex-1 rounded-[12px] border border-ios-separator bg-white px-4 py-2.5 text-[15px] text-ios-label placeholder:text-ios-tertiary focus:border-accent focus:outline-none"
                        />
                        <button
                            onClick={addItem}
                            disabled={!addText.trim()}
                            className="rounded-[10px] bg-accent px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-50"
                        >
                            +
                        </button>
                    </div>

                    {total > 0 && (
                        <button
                            onClick={async () => {
                                if (!list) return;
                                setFinalizing(true);
                                try {
                                    await apiFetch(`/lists/${list.id}/finalize`, {
                                        method: "POST",
                                    });
                                    navigate("/list");
                                } catch {
                                    setFinalizing(false);
                                }
                            }}
                            disabled={finalizing}
                            className="w-full rounded-[14px] bg-accent py-4 text-[17px] font-semibold text-white disabled:opacity-50"
                        >
                            {finalizing ? "Afronden..." : "Klaar met winkelen"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
