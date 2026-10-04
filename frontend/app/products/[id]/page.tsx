import Link from 'next/link';
import { AddToCartForm } from '@/components/add-to-cart-form';
import { api } from '@/lib/api';
import { formatCents } from '@/lib/format';
import { loadOrRedirect } from '@/lib/guards';
import { getSession } from '@/lib/session';

export default async function ProductPage(props: PageProps<'/products/[id]'>) {
  const { id } = await props.params;
  const [product, session] = await Promise.all([
    loadOrRedirect(`/products/${id}`, () => api.getProduct(id)),
    getSession(),
  ]);

  return (
    <article className="page flex flex-col gap-8">
      <Link href="/" className="link self-start">
        ← Catalog
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border-3 border-ink bg-lilac font-bold text-lilac-ink shadow-lg">
          No image
        </div>
        <div className="panel flex flex-col gap-5 p-7">
          <h1 className="font-display text-display-md">{product.name}</h1>
          <span className="self-start rounded-sm border-3 border-ink bg-accent px-3 py-1 font-display text-display-sm">
            {formatCents(product.priceCents)}
          </span>
          <p className="text-small font-medium text-muted">
            {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
          </p>
          {product.description && (
            <p className="max-w-prose whitespace-pre-line text-body-lg">
              {product.description}
            </p>
          )}
          <div className="border-t-3 border-dashed border-ink pt-5">
            <AddToCartForm
              productId={product.id}
              stock={product.stock}
              signedIn={session !== null}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
