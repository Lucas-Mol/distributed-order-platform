'use server';

import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { safeNextPath } from '@/lib/navigation';
import { clearSessionCookie, setSessionCookie } from '@/lib/session';
import { handleActionError } from './errors';
import type { ActionState } from './state';

function readCredentials(formData: FormData) {
  const email = formData.get('email');
  const password = formData.get('password');
  if (typeof email !== 'string' || typeof password !== 'string') {
    return null;
  }
  return { email: email.trim(), password };
}

export async function login(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const credentials = readCredentials(formData);
  if (!credentials) {
    return { error: 'Email and password are required.' };
  }
  try {
    const { accessToken } = await api.login(
      credentials.email,
      credentials.password,
    );
    await setSessionCookie(accessToken);
  } catch (error) {
    return handleActionError(error, '/login', {
      400: 'Invalid email or password format.',
      401: 'Invalid email or password.',
    });
  }
  redirect(safeNextPath(formData.get('next')));
}

export async function register(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const credentials = readCredentials(formData);
  if (!credentials) {
    return { error: 'Email and password are required.' };
  }
  if (credentials.password !== formData.get('confirmPassword')) {
    return { error: 'Passwords do not match.' };
  }
  try {
    await api.register(credentials.email, credentials.password);
    const { accessToken } = await api.login(
      credentials.email,
      credentials.password,
    );
    await setSessionCookie(accessToken);
  } catch (error) {
    return handleActionError(error, '/register', {
      409: 'This email is already registered.',
    });
  }
  redirect(safeNextPath(formData.get('next')));
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}
