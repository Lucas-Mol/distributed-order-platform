'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { saveProduct } from '@/app/actions/products';
import { initialActionState } from '@/app/actions/state';
import { centsToInput, parseCents } from '@/lib/format';
import { MAX_STOCK, type Product } from '@/lib/types';
import { DeleteProductButton } from './delete-product-button';
import { FormMessage } from './form-message';
import { ImageDropzone } from './image-dropzone';
import { ManagerBadge } from './manager-badge';
import { ProductCard } from './product-card';
import { SubmitButton } from './submit-button';

export function ProductEditor({
  product,
  notice,
}: {
  product?: Product;
  notice?: string;
}) {
  const [state, action] = useActionState(saveProduct, initialActionState);
  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(
    product ? centsToInput(product.priceCents) : '',
  );
  const [stock, setStock] = useState(String(product?.stock ?? 0));

  return (
    <form action={action} className="flex flex-col gap-8">
      {product && <input type="hidden" name="id" value={product.id} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <ManagerBadge />
          <h1 className="font-display text-display-lg">
            {product ? 'Edit product' : 'New product'}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/products" className="btn btn-secondary btn-lg">
            Cancel
          </Link>
          <SubmitButton variant="accent" size="lg" pendingLabel="Saving…">
            Save product
          </SubmitButton>
        </div>
      </div>

      {notice && !state.error && !state.success && (
        <p role="status" className="rounded-sm border-3 border-ink bg-status-delivered px-4 py-3 font-bold">
          {notice}
        </p>
      )}
      <FormMessage state={state} />

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
        <div className="panel flex flex-col gap-5 p-6 sm:p-7">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="field-label">Name</label>
            <input
              id="name"
              name="name"
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="input"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="description" className="field-label">Description</label>
            <textarea
              id="description"
              name="description"
              maxLength={2000}
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="input h-auto min-h-32 py-3"
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="price" className="field-label">Price (USD)</label>
              <input
                id="price"
                name="price"
                required
                inputMode="decimal"
                pattern="\d{1,9}(\.\d{1,2})?"
                placeholder="12.90"
                aria-describedby="price-help"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                className="input"
              />
              <p id="price-help" className="text-small text-muted">
                Dot for cents, no currency sign.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="stock" className="field-label">Stock</label>
              <input
                id="stock"
                name="stock"
                type="number"
                required
                min={0}
                max={MAX_STOCK}
                step={1}
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                className="input"
              />
            </div>
          </div>
          {product && (
            <div className="flex flex-col gap-3 border-t-3 border-dashed border-ink pt-5">
              <p className="text-small text-muted">
                Products that appear in orders cannot be deleted; set their stock to 0 instead.
              </p>
              <DeleteProductButton productId={product.id} productName={product.name} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {product ? (
            <ImageDropzone productId={product.id} hasImage={product.imageKey !== null} />
          ) : (
            <p className="rounded-xl border-3 border-dashed border-ink bg-lilac px-5 py-8 text-center font-bold text-lilac-ink">
              Save the product first, then add a photo.
            </p>
          )}
          <div className="flex flex-col gap-3">
            <span className="overline">Catalog preview</span>
            <ProductCard
              product={{
                id: product?.id ?? 'preview',
                name,
                description: description || null,
                priceCents: parseCents(price) ?? 0,
                stock: Number.isInteger(Number(stock)) ? Number(stock) : 0,
                imageUrl: product?.imageUrl ?? null,
                thumbnailUrl: product?.thumbnailUrl ?? null,
              }}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
