import Link from 'next/link';
import { formatCents } from '@/lib/format';
import type { Product } from '@/lib/types';

const LOW_STOCK = 5;

function stockLabel(stock: number): string {
  if (stock <= 0) {
    return 'Out of stock';
  }
  if (stock <= LOW_STOCK) {
    return stock === 1 ? 'Only 1 left' : `Only ${stock} left`;
  }
  return `${stock} in stock`;
}

export function ProductCard({ product }: { product: Product }) {
  const soldOut = product.stock <= 0;
  return (
    <Link
      href={`/products/${product.id}`}
      className="card card-product card-interactive flex h-full flex-col"
    >
      <div className="relative flex h-[170px] items-center justify-center border-b-3 border-ink bg-lilac px-4 text-center font-bold text-lilac-ink">
        No image
        <span className="absolute top-3 right-3 rounded-sm border-3 border-ink bg-accent px-2 py-1 font-display text-body-lg text-ink">
          {formatCents(product.priceCents)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-[18px]">
        <span className="text-title font-bold">{product.name}</span>
        {product.description && (
          <span className="line-clamp-2 text-small text-muted">
            {product.description}
          </span>
        )}
        <span className="text-small font-medium text-muted">
          {stockLabel(product.stock)}
        </span>
        <span
          className={`btn pointer-events-none mt-auto w-full ${soldOut ? 'bg-disabled text-muted' : 'btn-primary'}`}
        >
          {soldOut ? 'Sold out' : 'View product'}
        </span>
      </div>
    </Link>
  );
}
