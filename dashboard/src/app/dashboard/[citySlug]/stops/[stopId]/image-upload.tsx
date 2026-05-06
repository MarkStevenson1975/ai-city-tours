'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadStopImage, removeStopImageOverride } from './actions';

interface Props {
  stopId: string;
  citySlug: string;
  /** Operator-uploaded URL (Supabase Storage). When set, takes precedence on the public tour. */
  currentOverride: string | null;
  /** Default URL field (Wikipedia/AI etc.). Shown when no override is set. */
  fallbackUrl: string | null;
}

export function ImageUpload({
  stopId,
  citySlug,
  currentOverride,
  fallbackUrl,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('stopId', stopId);
    formData.append('citySlug', citySlug);

    startTransition(async () => {
      const result = await uploadStopImage(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
      // Reset input so the same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  function handleRemove() {
    if (
      !window.confirm(
        'Remove the custom upload? The default URL image will be used instead.'
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await removeStopImageOverride(stopId, citySlug);
      if (!result.ok) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const displayUrl = currentOverride || fallbackUrl;
  const isOverride = Boolean(currentOverride);

  return (
    <div>
      {/* Preview */}
      {displayUrl ? (
        <div className="relative inline-block mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt="Stop hero"
            className="rounded-lg max-h-56 object-cover border border-gray-200"
            onError={(e) => {
              (e.target as HTMLImageElement).style.opacity = '0.3';
            }}
          />
          {isOverride && (
            <span className="absolute top-2 left-2 bg-green-700 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
              Custom upload
            </span>
          )}
        </div>
      ) : (
        <div className="mb-3 bg-cream border-2 border-dashed border-muted-dark rounded-lg h-40 flex items-center justify-center text-sm text-gray-500 italic">
          No image yet. Upload one or paste a URL below
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Action buttons */}
      <div className="flex gap-2 items-center flex-wrap">
        <button
          type="button"
          onClick={pickFile}
          disabled={isPending}
          className="px-4 py-2 text-sm font-bold rounded-full border border-primary text-primary hover:bg-primary hover:text-cream transition disabled:opacity-50"
        >
          {isPending
            ? 'Uploading…'
            : isOverride
              ? 'Replace upload'
              : 'Upload custom image'}
        </button>
        {isOverride && !isPending && (
          <button
            type="button"
            onClick={handleRemove}
            className="px-3 py-2 text-xs text-red-700 hover:bg-red-50 rounded font-bold"
          >
            Remove override
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <p className="mt-2 text-xs text-gray-400">
        For best results: <span className="text-gray-500 font-medium">16:10 landscape</span> · recommended 1600 x 1000 px (minimum 1200 x 750 px) · JPEG or WebP preferred (WebP gives smaller file sizes) · max 5 MB enforced.
        Uploads override the default URL until removed. Saved to draft instantly — click Publish to push live.
      </p>
    </div>
  );
}
