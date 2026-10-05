import type { Metadata } from 'next';
import { ProductEditor } from '@/components/product-editor';
import { api } from '@/lib/api';
import { requireManager } from '@/lib/current-user';
import { loadOrRedirect } from '@/lib/guards';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage(
  props: PageProps<'/admin/products/[id]'>,
) {
  const [{ id }, { created }] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const currentPath = `/admin/products/${id}`;
  await requireManager(currentPath);
  const product = await loadOrRedirect(currentPath, () => api.getProduct(id));

  return (
    <div className="page">
      <ProductEditor
        key={product.id}
        product={product}
        notice={created ? 'Product created. Now add a photo.' : undefined}
      />
    </div>
  );
}
