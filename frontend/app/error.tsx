'use client';

import { useEffect } from 'react';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="page flex flex-col items-center gap-5 py-16 text-center">
      <h1 className="font-display text-display-md">Something went wrong</h1>
      <p className="text-body-lg text-muted">
        We could not load this page. Please try again.
      </p>
      <button type="button" onClick={() => retry()} className="btn btn-primary">
        Try again
      </button>
    </div>
  );
}
