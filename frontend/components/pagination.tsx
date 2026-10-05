import Link from 'next/link';

export function Pagination({
  basePath,
  page,
  hasNext,
  params = {},
}: {
  basePath: string;
  page: number;
  hasNext: boolean;
  params?: Record<string, string>;
}) {
  if (page === 1 && !hasNext) {
    return null;
  }
  const pageHref = (target: number) =>
    `${basePath}?${new URLSearchParams({ ...params, page: String(target) })}`;
  return (
    <nav className="flex items-center justify-center gap-4" aria-label="Pagination">
      {page > 1 ? (
        <Link href={pageHref(page - 1)} className="btn btn-secondary">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-small font-bold text-muted">Page {page}</span>
      {hasNext ? (
        <Link href={pageHref(page + 1)} className="btn btn-secondary">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
