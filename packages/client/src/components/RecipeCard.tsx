import { Link } from "react-router-dom";

interface RecipeCardProps {
  id: string;
  title: string;
  imageUrl: string | null;
  servings: number;
  tags: string[];
  timesCooked: number;
}

export default function RecipeCard({
  id,
  title,
  imageUrl,
  servings,
  tags,
  timesCooked,
}: RecipeCardProps) {
  return (
    <Link
      to={`/recipes/${id}`}
      className="block overflow-hidden rounded-[12px] bg-white shadow-sm transition hover:shadow-md"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="flex h-36 items-center justify-center bg-ios-category-bg text-3xl">
          🍽️
        </div>
      )}
      <div className="p-3">
        <h3 className="text-[15px] font-semibold text-ios-label line-clamp-2">{title}</h3>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-ios-secondary">
          <span>{servings} personen</span>
          {timesCooked > 0 && <span>· {timesCooked}x gekookt</span>}
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] font-medium text-accent"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
