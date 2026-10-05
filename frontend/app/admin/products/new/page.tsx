import type { Metadata } from 'next';
import { ProductEditor } from '@/components/product-editor';
import { requireManager } from '@/lib/current-user';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  await requireManager('/admin/products/new');
  return (
    <div className="page">
      <ProductEditor />
    </div>
  );
}
