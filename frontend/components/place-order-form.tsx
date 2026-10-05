'use client';

import { useActionState } from 'react';
import { placeOrder } from '@/app/actions/orders';
import { initialActionState } from '@/app/actions/state';
import { FormMessage } from './form-message';
import { SubmitButton } from './submit-button';

export function PlaceOrderForm() {
  const [state, action] = useActionState(placeOrder, initialActionState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <SubmitButton variant="accent" size="lg" fullWidth pendingLabel="Placing order…">
        Place order
      </SubmitButton>
    </form>
  );
}
