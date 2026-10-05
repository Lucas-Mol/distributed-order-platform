import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { AuthShell } from '@/components/auth-shell';
import { safeNextPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage(props: PageProps<'/login'>) {
  const { next, expired } = await props.searchParams;
  return (
    <AuthShell title="Sign in">
      {expired && (
        <p role="status" className="rounded-sm border-3 border-ink bg-sun px-3 py-2 text-small font-bold">
          Your session has expired. Please sign in again.
        </p>
      )}
      <AuthForm mode="login" next={safeNextPath(next)} />
    </AuthShell>
  );
}
