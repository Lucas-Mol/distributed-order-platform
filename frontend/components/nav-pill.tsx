'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavPill({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="nav-pill"
    >
      {children}
    </Link>
  );
}
