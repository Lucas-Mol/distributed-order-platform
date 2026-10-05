import Link from 'next/link';

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border-3 border-dashed border-ink bg-lilac px-5 py-10 text-center text-lilac-ink">
      <p className="font-display text-display-sm">{title}</p>
      {action && (
        <Link href={action.href} className="btn btn-primary">
          {action.label}
        </Link>
      )}
    </div>
  );
}
