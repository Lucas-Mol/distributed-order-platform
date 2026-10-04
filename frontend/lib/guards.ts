import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { ApiError } from './api';
import { loginPath } from './navigation';

export async function loadOrRedirect<T>(
  currentPath: string,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) {
        redirect(loginPath(currentPath, true));
      }
      if (error.status === 400 || error.status === 404) {
        notFound();
      }
    }
    throw error;
  }
}
