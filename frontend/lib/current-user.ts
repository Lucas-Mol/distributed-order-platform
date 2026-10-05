import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { api, ApiError } from './api';
import { loginPath } from './navigation';
import { getSession } from './session';
import type { Role, User } from './types';

const RANK: Record<Role, number> = { CUSTOMER: 0, MANAGER: 1, ADMIN: 2 };

export function hasRole(user: User | null, required: Role): boolean {
  return user !== null && RANK[user.role] >= RANK[required];
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!(await getSession())) {
    return null;
  }
  try {
    return await api.me();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
});

/** UI guard for manager pages; the API enforces the same rule with 403. */
export async function requireManager(currentPath: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath(currentPath, true));
  }
  if (!hasRole(user, 'MANAGER')) {
    redirect('/');
  }
  return user;
}
