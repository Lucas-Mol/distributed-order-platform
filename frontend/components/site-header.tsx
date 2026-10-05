import Link from 'next/link';
import { logout } from '@/app/actions/auth';
import { getCurrentUser, hasRole } from '@/lib/current-user';
import { NavPill } from './nav-pill';

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="border-b-3 border-ink bg-sun">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link href="/" className="font-display text-logo">
          orders!
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-2">
          <NavPill href="/">Catalog</NavPill>
          {user && <NavPill href="/orders">My orders</NavPill>}
          {hasRole(user, 'MANAGER') && (
            <NavPill href="/admin/products">
              Products
              <span className="rounded-[4px] bg-ink px-1.5 py-0.5 text-[10px] font-bold tracking-[0.06em] text-sun">
                MANAGER
              </span>
            </NavPill>
          )}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <>
              <Link href="/cart" className="btn btn-accent">
                Cart
              </Link>
              <span className="nav-pill hidden lg:inline-flex" title={user.email}>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-5 shrink-0 fill-none stroke-ink stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                <span className="sr-only">Signed in as </span>
                <span className="max-w-48 truncate">{user.email}</span>
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
