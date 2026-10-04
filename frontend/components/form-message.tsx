import type { ActionState } from '@/app/actions/state';

export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-small font-medium text-danger">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p
        role="status"
        className="rounded-sm border-3 border-ink bg-status-delivered px-3 py-2 text-small font-bold"
      >
        {state.success}
      </p>
    );
  }
  return null;
}
