'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login, register } from '@/app/actions/auth';
import { initialActionState } from '@/app/actions/state';
import { FormMessage } from './form-message';
import { SubmitButton } from './submit-button';

export function AuthForm({
  mode,
  next,
}: {
  mode: 'login' | 'register';
  next: string;
}) {
  const [state, action] = useActionState(
    mode === 'login' ? login : register,
    initialActionState,
  );
  const isLogin = mode === 'login';
  const nextQuery = `?next=${encodeURIComponent(next)}`;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className="input"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete={isLogin ? 'current-password' : 'new-password'}
          aria-describedby={isLogin ? undefined : 'password-rules'}
          className="input"
        />
        {!isLogin && (
          <p id="password-rules" className="text-small text-muted">
            8 to 128 characters.
          </p>
        )}
      </div>
      {!isLogin && (
        <div className="flex flex-col gap-2">
          <label htmlFor="confirmPassword" className="field-label">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            className="input"
          />
        </div>
      )}
      <FormMessage state={state} />
      <SubmitButton
        variant={isLogin ? 'primary' : 'accent'}
        size="lg"
        fullWidth
        pendingLabel={isLogin ? 'Signing in…' : 'Creating account…'}
      >
        {isLogin ? 'Sign in' : 'Create account'}
      </SubmitButton>
      <p className="text-center text-body">
        {isLogin ? (
          <>
            No account?{' '}
            <Link href={`/register${nextQuery}`} className="link">
              Create account
            </Link>
          </>
        ) : (
          <>
            Already registered?{' '}
            <Link href={`/login${nextQuery}`} className="link">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
