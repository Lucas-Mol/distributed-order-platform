/** Full-page yellow backdrop with a centered card, shared by sign-in and register. */
export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="-mt-[3px] flex flex-1 items-start justify-center bg-sun px-4 py-12 sm:items-center">
      <div className="panel flex w-full max-w-[440px] flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <span className="font-display text-logo">orders!</span>
          <h1 className="font-display text-display-md">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
