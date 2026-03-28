import {useState} from "react";

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
        className="flex w-full items-center justify-between bg-ios-category-bg px-4 py-2"
      >
        <span className="text-[13px] font-semibold text-ios-label">{category}</span>
        <span className="flex items-center gap-1 text-[12px] text-ios-secondary">
          <span>{count} items</span>
          <svg
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}
