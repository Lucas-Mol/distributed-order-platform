import { EmptyState } from '@/components/empty-state';

export default function NotFound() {
  return (
    <div className="page">
      <EmptyState
        title="We could not find what you were looking for."
        action={{ href: '/', label: 'Back to the catalog' }}
      />
    </div>
  );
}
