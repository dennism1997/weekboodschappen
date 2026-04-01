import {useState} from "react";
import {useDroppable} from "@dnd-kit/core";

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
  const { setNodeRef, isOver } = useDroppable({ id: `category:${category}` });

  return (
    <div ref={setNodeRef} className={`mb-3 rounded-[12px] transition-colors ${isOver ? "ring-2 ring-accent" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-between rounded-t-[12px] px-4 py-2 transition-colors ${isOver ? "bg-accent-light" : "bg-ios-category-bg"}`}
      >
        <span className="text-[13px] font-semibold text-ios-label">{category}</span>
        <span className="flex items-center gap-1 text-[12px] text-ios-secondary">
          <span>{count} items</span>
          <svg
            className={`h-4 w-4 transition-transform ${open || isOver ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {(open || isOver) && <div className="overflow-hidden rounded-b-[12px] bg-white">{children}</div>}
    </div>
  );
}
