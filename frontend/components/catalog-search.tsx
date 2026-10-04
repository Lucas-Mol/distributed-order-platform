import Form from 'next/form';
import { MAX_SEARCH_LENGTH } from '@/lib/types';

export function CatalogSearch({ search }: { search: string }) {
  return (
    <Form action="/" role="search" className="flex max-w-2xl flex-col gap-2">
      <label htmlFor="catalog-search" className="field-label">
        Search by name or description
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          key={search}
          id="catalog-search"
          name="q"
          type="search"
          defaultValue={search}
          maxLength={MAX_SEARCH_LENGTH}
          placeholder="Pizza, salad, lemonade…"
          className="input h-14 shadow-sm"
        />
        <button type="submit" className="btn btn-primary h-14 shrink-0">
          Search
        </button>
      </div>
    </Form>
  );
}
