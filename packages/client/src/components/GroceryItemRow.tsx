import {useState} from "react";
import {useDraggable} from "@dnd-kit/core";
import DiscountBadge from "./DiscountBadge";

interface DiscountInfo {
  store?: string;
  percentage: number;
  originalPrice: number;
  salePrice: number;
}

interface GroceryItemRowProps {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  source: "recept" | "basis" | "handmatig";
  checked: boolean;
  sliding?: boolean;
  discountInfo?: DiscountInfo | null;
  onToggle: (id: string) => void;
  onQuantityChange?: (id: string, quantity: number) => void;
  draggable?: boolean;
}

const sourceBadgeColors: Record<string, string> = {
  recept: "bg-source-recept-bg text-source-recept-text",
  basis: "bg-source-basis-bg text-source-basis-text",
  handmatig: "bg-source-handmatig-bg text-source-handmatig-text",
};

export default function GroceryItemRow({
  id,
  name,
  quantity,
  unit,
  source,
  checked,
  sliding,
  discountInfo,
  onToggle,
  onQuantityChange,
  draggable = true,
}: GroceryItemRowProps) {
  const [editingQty, setEditingQty] = useState(false);
  const [qtyInput, setQtyInput] = useState(String(quantity));

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled: !draggable || checked,
  });

  const commitQty = () => {
    setEditingQty(false);
    const parsed = parseFloat(qtyInput);
    if (!isNaN(parsed) && parsed > 0 && parsed !== quantity) {
      onQuantityChange?.(id, parsed);
    } else {
      setQtyInput(String(quantity));
    }
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      className="border-b border-ios-separator/50 last:border-b-0"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <div
        className="flex min-h-[44px] items-center gap-3 px-4 py-3"
        style={{
          transition: "transform 200ms ease-out, opacity 200ms ease-out",
          transform: sliding ? "translateY(12px)" : "translateY(0)",
          opacity: sliding ? 0 : 1,
        }}
      >
        {/* Checkbox toggle */}
        <button
          onClick={() => onToggle(id)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
            checked ? "border-accent bg-accent text-white" : "border-ios-tertiary"
          }`}
        >
          {checked && (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Name — tapping also toggles */}
        <button
          onClick={() => onToggle(id)}
          className="flex-1 min-w-0 text-left"
        >
          <span className={`text-[17px] ${checked ? "text-ios-tertiary line-through" : "text-ios-label"}`}>
            {name}
          </span>
        </button>

        <DiscountBadge discountInfo={discountInfo ?? null} />

        {/* Quantity — tap to edit */}
        {editingQty ? (
          <input
            type="number"
            value={qtyInput}
            autoFocus
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => { if (e.key === "Enter") commitQty(); if (e.key === "Escape") { setEditingQty(false); setQtyInput(String(quantity)); } }}
            onClick={(e) => e.stopPropagation()}
            className="w-16 rounded-[6px] border border-accent px-2 py-0.5 text-center text-[13px] text-ios-label focus:outline-none"
            style={{ touchAction: "manipulation" }}
          />
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); if (!checked) { setQtyInput(String(quantity)); setEditingQty(true); } }}
            className={`text-[13px] ${checked ? "text-ios-tertiary line-through" : "text-ios-secondary"}`}
          >
            {quantity} {unit}
          </button>
        )}

        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sourceBadgeColors[source] ?? "bg-ios-category-bg text-ios-secondary"}`}
        >
          {source}
        </span>

        {/* Drag handle */}
        {draggable && !checked && (
          <span
            {...listeners}
            style={{ touchAction: "none", cursor: "grab" }}
            className="select-none text-[18px] leading-none text-ios-tertiary opacity-40 active:opacity-80"
          >
            ⠿
          </span>
        )}
      </div>
    </div>
  );
}
