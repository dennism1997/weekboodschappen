interface DiscountBadgeProps {
  discountInfo: {
    percentage: number;
    originalPrice: number;
    salePrice: number;
  } | null;
}

export default function DiscountBadge({ discountInfo }: DiscountBadgeProps) {
  if (!discountInfo || discountInfo.percentage <= 0) return null;

  return (
    <span className="inline-flex items-center rounded-full bg-green-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
      -{discountInfo.percentage}%
    </span>
  );
}
