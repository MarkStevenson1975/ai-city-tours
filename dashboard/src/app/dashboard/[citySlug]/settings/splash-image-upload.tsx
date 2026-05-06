'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadSplashImage, removeSplashImage } from './actions';

interface Props {
  cityId: string;
  citySlug: string;
  currentImageUrl: string | null;
}

export function SplashImageUpload({ cityId, citySlug, currentImageUrl }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('cityId', cityId);
    formData.append('citySlug', citySlug);
    startTransition(async () => {
      const result = await uploadSplashImage(formData);
      if (!result.ok) setError(result.error);
      else router.refresh();
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  function handleRemove() {
    if (!window.confirm('Remove the splash image? The default city photo will show instead.')) return;
    setError(null);
    startTransition(async () => {
      const result = await removeSplashImage(cityId, citySlug);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {/* Preview */}
      {currentImageUrl ? (
        <div
          className="relative w-full mb-3 overflow-hidden rounded-lg border border-gray-200"
          style={{ aspectRatio: '16/10' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImageUrl}
            alt="Splash screen"
            className="w-full h-full object-cover object-center"
          />
          <span className="absolute top-2 left-2 bg-green-700 text-white text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">
            Custom upload
          </span>
        </div>
      ) : (
        <div
          className="mb-3 bg-cream border-2 border-dashed border-muted-dark rounded-lg flex items-center justify-center text-sm text-gray-500 italic"
          style={{ aspectRatio: '16/10' }}
        >
          No custom splash image yet
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/webp,image/png"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex gap-2 items-center flex-wrap">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="px-4 py-2 text-sm font-bold rounded-full border border-primary text-primary hover:bg-primary hover:text-cream transition disabled:opacity-50"
        >
          {isPending
            ? 'Uploading…'
            : currentImageUrl
              ? 'Replace image'
              : 'Upload splash image'}
        </button>
        {currentImageUrl && !isPending && (
          <button
            type="button"
            onClick={handleRemove}
            className="px-3 py-2 text-xs text-red-700 hover:bg-red-50 rounded font-bold"
          >
            Remove image
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}

      <p className="mt-2 text-xs text-gray-400">
        For best results: <span className="text-gray-500 font-medium">16:10 landscape</span> · recommended 1600 x 1000 px (minimum 1200 x 750 px) · JPEG or WebP preferred · max 5 MB enforced.
        Saved to draft instantly — click Publish on the overview to push live.
      </p>
    </div>
  );
}
