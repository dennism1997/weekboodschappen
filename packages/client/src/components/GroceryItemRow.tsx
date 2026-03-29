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
}: GroceryItemRowProps) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="w-full border-b border-ios-separator/50 text-left active:bg-ios-category-bg"
    >
      <div
        className="flex min-h-[44px] items-center gap-3 px-4 py-3"
        style={{
          transition: "transform 200ms ease-out, opacity 200ms ease-out",
          transform: sliding ? "translateY(12px)" : "translateY(0)",
          opacity: sliding ? 0 : 1,
        }}
      >
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
            checked
              ? "border-accent bg-accent text-white"
              : "border-ios-tertiary"
          }`}
        >
          {checked && (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`text-[17px] ${checked ? "text-ios-tertiary line-through" : "text-ios-label"}`}>
            {name}
          </span>
        </div>
        <DiscountBadge discountInfo={discountInfo ?? null} />
        <span className={`text-[13px] ${checked ? "text-ios-tertiary line-through" : "text-ios-secondary"}`}>
          {quantity} {unit}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${sourceBadgeColors[source] ?? "bg-ios-category-bg text-ios-secondary"}`}
        >
          {source}
        </span>
      </div>
    </button>
  );
}
