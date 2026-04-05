import {Link} from "react-router-dom";

interface RecipeCardProps {
  id: string;
  title: string;
  sourceUrl?: string | null;
  imageUrl: string | null;
  servings: number;
  tags: string[];
  timesCooked: number;
  status?: "ready" | "pending" | "failed";
  onAdd?: () => void;
}

export default function RecipeCard({
  id,
  title,
  sourceUrl,
  imageUrl,
  servings,
  tags,
  timesCooked,
  status = "ready",
  onAdd,
}: RecipeCardProps) {
  const isPending = status === "pending";
  const isFailed = status === "failed";

  return (
    <div className="relative">
    <Link
      to={isPending && sourceUrl ? sourceUrl : `/recipes/${id}`}
      {...(isPending && sourceUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`block overflow-hidden rounded-[12px] bg-white shadow-sm transition hover:shadow-md ${isPending || isFailed ? "opacity-70" : ""}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="flex h-36 items-center justify-center bg-ios-category-bg text-3xl">
          {isPending ? "..." : "\uD83C\uDF7D\uFE0F"}
        </div>
      )}
      <div className="p-3">
        <h3 className="text-[15px] font-semibold text-ios-label line-clamp-2">{title}</h3>
        {isPending ? (
          <p className="mt-1 text-[12px] text-ios-secondary">Recept wordt opgehaald...</p>
        ) : isFailed ? (
          <p className="mt-1 text-[12px] text-ios-destructive">Ophalen mislukt</p>
        ) : (
        <div className="mt-1 flex items-center gap-2 text-[12px] text-ios-secondary">
          <span>{servings} personen</span>
          {timesCooked > 0 && <span>· {timesCooked}x gekookt</span>}
        </div>
        )}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-ios-category-bg px-2 py-0.5 text-[11px] font-medium text-ios-secondary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
    {onAdd && (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAdd(); }}
        className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white shadow-md text-[18px] font-medium leading-none"
        aria-label="Toevoegen aan weekplan"
      >
        +
      </button>
    )}
    </div>
  );
}
