import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { ManagerBadge } from '@/components/manager-badge';
import { Pagination } from '@/components/pagination';
import { ProductImage } from '@/components/product-image';
import { api } from '@/lib/api';
import { requireManager } from '@/lib/current-user';
import { formatCents } from '@/lib/format';
import { pageFromSearchParam } from '@/lib/navigation';
import { PAGE_SIZE } from '@/lib/types';

export const metadata: Metadata = { title: 'Manage products' };

export default async function AdminProductsPage(
  props: PageProps<'/admin/products'>,
) {
  await requireManager('/admin/products');
  const page = pageFromSearchParam((await props.searchParams).page);
  const products = await api.listProducts({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div className="page flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <ManagerBadge />
          <h1 className="font-display text-display-lg">Products</h1>
        </div>
        <Link href="/admin/products/new" className="btn btn-accent btn-lg">
          New product
        </Link>
      </div>
      {products.length === 0 ? (
        <EmptyState
          title="No products yet."
          action={{ href: '/admin/products/new', label: 'Create the first one' }}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-16">
                  <span className="sr-only">Photo</span>
                </th>
                <th>Name</th>
                <th className="text-right">Price</th>
                <th className="text-right">Stock</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <ProductImage
                      sources={[product.thumbnailUrl, product.imageUrl]}
                      alt=""
                      className="size-12 overflow-hidden rounded-sm border-3 border-ink text-[0px]"
                    />
                  </td>
                  <td className="font-bold">{product.name}</td>
                  <td className="text-right font-display">
                    {formatCents(product.priceCents)}
                  </td>
                  <td className="text-right">{product.stock}</td>
                  <td className="text-right">
                    <Link
                      href={`/admin/products/${product.id}`}
                      className="btn btn-secondary"
                      aria-label={`Edit ${product.name}`}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        basePath="/admin/products"
        page={page}
        hasNext={products.length === PAGE_SIZE}
      />
    </div>
  );
}
