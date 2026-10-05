export default function Loading() {
  return (
    <div className="page flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="h-11 w-56 animate-pulse rounded-md bg-disabled" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
        <div className="h-72 animate-pulse rounded-lg border-3 border-ink bg-disabled" />
        <div className="h-72 animate-pulse rounded-lg border-3 border-ink bg-disabled" />
        <div className="h-72 animate-pulse rounded-lg border-3 border-ink bg-disabled" />
      </div>
    </div>
  );
}
