'use client';

import { useState } from 'react';

export function ProductImage({
  sources,
  alt,
  className = '',
  fit = 'cover',
}: {
  sources: (string | null)[];
  alt: string;
  className?: string;
  fit?: 'cover' | 'contain';
}) {
  const candidates = sources.filter((src): src is string => Boolean(src));
  const [failed, setFailed] = useState(0);
  const src = candidates[failed];

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-lilac px-4 text-center font-bold text-lilac-ink ${fit === 'contain' ? 'aspect-square' : ''} ${className}`}
      >
        No image
      </div>
    );
  }
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      onError={() => setFailed((count) => count + 1)}
      className={`bg-lilac ${fit === 'contain' ? 'h-auto object-contain' : 'object-cover'} ${className}`}
    />
  );
}
