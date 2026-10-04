import Link from 'next/link';
import { CatalogSearch } from '@/components/catalog-search';
import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { ProductCard } from '@/components/product-card';
import { api } from '@/lib/api';
import { pageFromSearchParam, searchFromParam } from '@/lib/navigation';
import { MAX_SEARCH_LENGTH, PAGE_SIZE } from '@/lib/types';

export default async function CatalogPage(props: PageProps<'/'>) {
  const searchParams = await props.searchParams;
  const page = pageFromSearchParam(searchParams.page);
  const search = searchFromParam(searchParams.q, MAX_SEARCH_LENGTH);
  const products = await api.listProducts(
    { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    search,
  );

  return (
    <>
      <section className="-mt-[3px] border-b-3 border-ink bg-sun">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-6 pb-10 sm:px-8">
          <h1 className="max-w-3xl font-display text-[40px] leading-none tracking-[-0.03em] sm:text-display-xl">
            What are we ordering today?
          </h1>
          <CatalogSearch search={search} />
        </div>
      </section>
      <div className="page flex flex-col gap-8">
        {search && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="font-display text-display-sm">
              Results for “{search}”
            </h2>
            <Link href="/" className="btn btn-secondary">
              Clear search
            </Link>
          </div>
        )}
        {products.length === 0 ? (
          search ? (
            <EmptyState
              title="No products match your search."
              action={{ href: '/', label: 'See all products' }}
            />
          ) : (
            <EmptyState title="No products available yet." />
          )
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6">
            {products.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
        <Pagination
          basePath="/"
          page={page}
          hasNext={products.length === PAGE_SIZE}
          params={search ? { q: search } : {}}
        />
      </div>
    </>
  );
}
