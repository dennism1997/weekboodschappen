interface DiscountBadgeProps {
  discountInfo: {
    store?: string;
    percentage: number;
    originalPrice: number;
    salePrice: number;
  } | null;
}

const storeLabels: Record<string, string> = {
  jumbo: "Jumbo",
  albert_heijn: "AH",
};

export default function DiscountBadge({ discountInfo }: DiscountBadgeProps) {
  if (!discountInfo || discountInfo.percentage <= 0) return null;

  const storeLabel = discountInfo.store ? storeLabels[discountInfo.store] || discountInfo.store : null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold leading-none text-white">
      {storeLabel && <span>{storeLabel}</span>}
      <span>-{discountInfo.percentage}%</span>
      <span>€{discountInfo.salePrice.toFixed(2)}</span>
    </span>
  );
}
