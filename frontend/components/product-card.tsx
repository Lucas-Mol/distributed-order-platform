import Link from 'next/link';
import { formatCents } from '@/lib/format';
import { ProductImage } from './product-image';

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

export interface ProductCardData {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  stock: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}

export function ProductCard({
  product,
  href,
}: {
  product: ProductCardData;
  href?: string;
}) {
  const soldOut = product.stock <= 0;
  const body = (
    <>
      <div className="relative border-b-3 border-ink">
        <ProductImage
          sources={[product.thumbnailUrl, product.imageUrl]}
          alt=""
          className="h-[170px] w-full"
        />
        <span className="absolute top-3 right-3 rounded-sm border-3 border-ink bg-accent px-2 py-1 font-display text-body-lg text-ink">
          {formatCents(product.priceCents)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-[18px]">
        <span className="text-title font-bold break-words">
          {product.name || 'Product name'}
        </span>
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
    </>
  );

  return href ? (
    <Link
      href={href}
      className="card card-product card-interactive flex h-full flex-col"
    >
      {body}
    </Link>
  ) : (
    <div className="card card-product flex h-full flex-col">{body}</div>
  );
}
