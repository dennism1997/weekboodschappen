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
      className="block overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md"
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={title}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="flex h-36 items-center justify-center bg-gray-100 text-3xl">
          🍽️
        </div>
      )}
      <div className="p-3">
        <h3 className="text-sm font-semibold text-gray-900 line-clamp-2">{title}</h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
          <span>{servings} personen</span>
          {timesCooked > 0 && <span>· {timesCooked}x gekookt</span>}
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
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
