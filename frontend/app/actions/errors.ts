import 'server-only';
import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { loginPath } from '@/lib/navigation';
import type { ActionState } from './state';

export function handleActionError(
  error: unknown,
  currentPath: string,
  messages: Partial<Record<number, string>> = {},
): ActionState {
  if (!(error instanceof ApiError)) {
    throw error;
  }
  const custom = messages[error.status];
  if (custom) {
    return { error: custom };
  }
  if (error.status === 401) {
    redirect(loginPath(currentPath, true));
  }
  if (error.status === 429) {
    return { error: 'Too many requests. Please wait a moment and try again.' };
  }
  if (error.status >= 500) {
    return { error: 'The service is unavailable. Please try again later.' };
  }
  return { error: error.message };
}
