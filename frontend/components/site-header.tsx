import Link from 'next/link';
import { logout } from '@/app/actions/auth';
import { getSession } from '@/lib/session';
import { NavPill } from './nav-pill';

export async function SiteHeader() {
  const session = await getSession();
  return (
    <header className="border-b-3 border-ink bg-sun">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link href="/" className="font-display text-logo">
          orders!
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-2">
          <NavPill href="/">Catalog</NavPill>
          {session && <NavPill href="/orders">My orders</NavPill>}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {session ? (
            <>
              <Link href="/cart" className="btn btn-accent">
                Cart
              </Link>
              <span className="nav-pill hidden lg:inline-flex" title={session.email}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-5 shrink-0 fill-none stroke-ink stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                <span className="sr-only">Signed in as </span>
                <span className="max-w-48 truncate">{session.email}</span>
              </span>
              <form action={logout}>
                <button type="submit" className="btn btn-secondary">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-secondary">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-primary">
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
