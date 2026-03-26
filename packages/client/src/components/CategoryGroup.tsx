import { useState } from "react";

interface CategoryGroupProps {
  category: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function CategoryGroup({
  category,
  count,
  children,
  defaultOpen = true,
}: CategoryGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-lg bg-gray-100 px-3 py-2"
      >
        <span className="text-sm font-semibold text-gray-700">{category}</span>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <span>{count} items</span>
          <svg
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
