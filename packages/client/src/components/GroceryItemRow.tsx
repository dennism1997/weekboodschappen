interface GroceryItemRowProps {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  source: "recept" | "basis" | "handmatig";
  checked: boolean;
  onToggle: (id: string) => void;
}

const sourceBadgeColors: Record<string, string> = {
  recept: "bg-blue-100 text-blue-700",
  basis: "bg-amber-100 text-amber-700",
  handmatig: "bg-purple-100 text-purple-700",
};

export default function GroceryItemRow({
  id,
  name,
  quantity,
  unit,
  source,
  checked,
  onToggle,
}: GroceryItemRowProps) {
  return (
    <button
      onClick={() => onToggle(id)}
      className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition active:bg-gray-50"
    >
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
          checked
            ? "border-green-600 bg-green-600 text-white"
            : "border-gray-300"
        }`}
      >
        {checked && (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${checked ? "text-gray-400 line-through" : "text-gray-900"}`}>
          {name}
        </span>
      </div>
      <span className={`text-xs ${checked ? "text-gray-300 line-through" : "text-gray-500"}`}>
        {quantity} {unit}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceBadgeColors[source] ?? "bg-gray-100 text-gray-600"}`}
      >
        {source}
      </span>
    </button>
  );
}
