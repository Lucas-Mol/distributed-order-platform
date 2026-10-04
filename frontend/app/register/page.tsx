import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { AuthShell } from '@/components/auth-shell';
import { safeNextPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Register' };

export default async function RegisterPage(props: PageProps<'/register'>) {
  const { next } = await props.searchParams;
  return (
    <AuthShell title="Create account">
      <AuthForm mode="register" next={safeNextPath(next)} />
    </AuthShell>
  );
}
