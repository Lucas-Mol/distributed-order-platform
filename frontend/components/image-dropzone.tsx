'use client';

import { useRef, useState, useTransition } from 'react';
import {
  attachImage,
  removeImage,
  requestImageUpload,
} from '@/app/actions/products';
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES } from '@/lib/types';

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

function validate(file: File): string | null {
  if (!(IMAGE_CONTENT_TYPES as string[]).includes(file.type)) {
    return 'Use a PNG or JPG image.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'The image must be at most 5 MB.';
  }
  return null;
}

export function ImageDropzone({
  productId,
  hasImage,
}: {
  productId: string;
  hasImage: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [removing, startRemove] = useTransition();
  const busy = status.kind === 'uploading' || removing;

  async function upload(file: File) {
    const invalid = validate(file);
    if (invalid) {
      setStatus({ kind: 'error', message: invalid });
      return;
    }
    setStatus({ kind: 'uploading' });
    const ticket = await requestImageUpload(productId, file.type, file.size);
    if ('error' in ticket) {
      setStatus({ kind: 'error', message: ticket.error });
      return;
    }
    let response: Response;
    try {
      response = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
    } catch {
      setStatus({ kind: 'error', message: 'Could not reach the storage service. Try again.' });
      return;
    }
    if (!response.ok) {
      setStatus({ kind: 'error', message: 'The upload was rejected. Try again.' });
      return;
    }
    const result = await attachImage(productId, ticket.key);
    setStatus(
      result.error
        ? { kind: 'error', message: result.error }
        : { kind: 'done', message: 'Photo updated. The thumbnail is ready in a few seconds.' },
    );
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && !busy) {
      void upload(file);
    }
  }

  function onRemove() {
    startRemove(async () => {
      const result = await removeImage(productId);
      setStatus(
        result.error
          ? { kind: 'error', message: result.error }
          : { kind: 'done', message: 'Photo removed.' },
      );
    });
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        onFiles(event.dataTransfer.files);
      }}
      className={`flex flex-col items-center gap-3 rounded-xl border-3 border-dashed border-ink px-5 py-8 text-center text-lilac-ink ${dragging ? 'bg-sun' : 'bg-lilac'}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-9 fill-none stroke-ink stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
      >
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
      </svg>
      <p className="font-display text-[20px] leading-tight text-ink">
        Drop the photo here
      </p>
      <p className="text-small">
        PNG or JPG, up to 5 MB. The thumbnail is generated automatically.
      </p>
      <input
        ref={input}
        type="file"
        accept={IMAGE_CONTENT_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="btn btn-primary"
        >
          {status.kind === 'uploading' ? 'Uploading…' : 'Choose file'}
        </button>
        {hasImage && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="btn btn-danger"
          >
            {removing ? 'Removing…' : 'Remove photo'}
          </button>
        )}
      </div>
      <p aria-live="polite" className="min-h-5 text-small font-bold">
        {status.kind === 'error' && (
          <span className="text-danger">{status.message}</span>
        )}
        {status.kind === 'done' && <span className="text-ink">{status.message}</span>}
      </p>
    </div>
  );
}
