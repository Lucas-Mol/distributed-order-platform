'use client';

import { startTransition, useActionState, useRef } from 'react';
import { deleteProduct } from '@/app/actions/products';
import { initialActionState } from '@/app/actions/state';
import { FormMessage } from './form-message';

export function DeleteProductButton({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(
    deleteProduct,
    initialActionState,
  );

  function confirm() {
    const formData = new FormData();
    formData.set('id', productId);
    startTransition(() => action(formData));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="btn btn-danger self-start"
      >
        Delete product
      </button>
      <FormMessage state={state} />
      <dialog
        ref={dialog}
        aria-labelledby="delete-product-title"
        className="panel m-auto w-[min(440px,calc(100%-32px))] p-7 backdrop:bg-ink/60"
      >
        <div className="flex flex-col gap-5">
          <h2 id="delete-product-title" className="font-display text-display-sm">
            Delete “{productName}”?
          </h2>
          <p className="text-body-lg">
            It disappears from the catalog and from carts. This cannot be undone.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => dialog.current?.close()}
              className="btn btn-secondary"
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                dialog.current?.close();
                confirm();
              }}
              className="btn btn-danger"
            >
              {pending ? 'Deleting…' : 'Delete product'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
