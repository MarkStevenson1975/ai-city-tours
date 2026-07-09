'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  uploadStopGalleryImage,
  removeStopGalleryImage,
  uploadStopVideo,
  removeStopVideo,
} from './actions';

const MAX_GALLERY = 4; // plus the hero = 5 images total
const MAX_VIDEO_SECONDS = 10;

interface Props {
  stopId: string;
  citySlug: string;
  initialGallery: string[];
  initialVideo: string | null;
}

export function GalleryVideoManager({
  stopId,
  citySlug,
  initialGallery,
  initialVideo,
}: Props) {
  const router = useRouter();
  const [gallery, setGallery] = useState<string[]>(initialGallery ?? []);
  const [video, setVideo] = useState<string | null>(initialVideo);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'gallery' | 'video' | null>(null);
  const [, startTransition] = useTransition();
  const galInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);

  function onGalleryFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy('gallery');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('stopId', stopId);
    fd.append('citySlug', citySlug);
    startTransition(async () => {
      const r = await uploadStopGalleryImage(fd);
      setBusy(null);
      if (!r.ok) setError(r.error);
      else {
        setGallery(r.urls);
        router.refresh();
      }
      if (galInput.current) galInput.current.value = '';
    });
  }

  function removeGallery(url: string) {
    setError(null);
    setBusy('gallery');
    startTransition(async () => {
      const r = await removeStopGalleryImage(stopId, citySlug, url);
      setBusy(null);
      if (!r.ok) setError(r.error);
      else {
        setGallery(r.urls);
        router.refresh();
      }
    });
  }

  function onVideoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    // Check duration in the browser before uploading.
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (probe.duration > MAX_VIDEO_SECONDS + 0.5) {
        setError(
          `Video must be ${MAX_VIDEO_SECONDS} seconds or less (yours is ${probe.duration.toFixed(1)}s). Trim it and try again.`
        );
        if (vidInput.current) vidInput.current.value = '';
        return;
      }
      setBusy('video');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('stopId', stopId);
      fd.append('citySlug', citySlug);
      startTransition(async () => {
        const r = await uploadStopVideo(fd);
        setBusy(null);
        if (!r.ok) setError(r.error);
        else {
          setVideo(r.url);
          router.refresh();
        }
        if (vidInput.current) vidInput.current.value = '';
      });
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      setError('Could not read that video. Use MP4, WebM or MOV.');
      if (vidInput.current) vidInput.current.value = '';
    };
    probe.src = url;
  }

  function removeVid() {
    setError(null);
    setBusy('video');
    startTransition(async () => {
      const r = await removeStopVideo(stopId, citySlug);
      setBusy(null);
      if (!r.ok) setError(r.error);
      else {
        setVideo(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Gallery */}
      <div>
        <h3 className="text-sm font-bold mb-1">More images (up to {MAX_GALLERY})</h3>
        <p className="text-xs text-gray-500 mb-3">
          These appear as a swipeable gallery after the main image on the tour.
          The main (hero) image is always shown first, so you get up to{' '}
          {MAX_GALLERY + 1} images per stop in total.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {gallery.map((url) => (
            <div
              key={url}
              className="relative rounded-lg overflow-hidden border border-gray-200 group"
              style={{ aspectRatio: '4/3' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeGallery(url)}
                disabled={busy !== null}
                className="absolute top-1 right-1 bg-black/60 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 disabled:opacity-50"
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          ))}

          {gallery.length < MAX_GALLERY && (
            <button
              type="button"
              onClick={() => galInput.current?.click()}
              disabled={busy !== null}
              className="rounded-lg border-2 border-dashed border-muted-dark text-sm text-gray-500 hover:border-primary hover:text-primary transition flex items-center justify-center disabled:opacity-50"
              style={{ aspectRatio: '4/3' }}
            >
              {busy === 'gallery' ? 'Uploading…' : '+ Add image'}
            </button>
          )}
        </div>

        <input
          ref={galInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onGalleryFile}
          className="hidden"
        />
        <p className="mt-2 text-xs text-gray-400">
          JPEG, PNG or WebP · max 5 MB each · landscape works best.
        </p>
      </div>

      {/* Video */}
      <div>
        <h3 className="text-sm font-bold mb-1">Short video (optional)</h3>
        <p className="text-xs text-gray-500 mb-3">
          Up to {MAX_VIDEO_SECONDS} seconds. It always plays{' '}
          <span className="font-medium">silently on a loop</span> in the tour, so
          sound is never used. Great for a flag moving, water, or a bit of
          atmosphere.
        </p>

        {video ? (
          <div className="space-y-2">
            <div
              className="relative rounded-lg overflow-hidden border border-gray-200 bg-black max-w-xs"
              style={{ aspectRatio: '16/10' }}
            >
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                src={video}
                muted
                loop
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <button
                type="button"
                onClick={() => vidInput.current?.click()}
                disabled={busy !== null}
                className="px-4 py-2 text-sm font-bold rounded-full border border-primary text-primary hover:bg-primary hover:text-cream transition disabled:opacity-50"
              >
                {busy === 'video' ? 'Uploading…' : 'Replace video'}
              </button>
              <button
                type="button"
                onClick={removeVid}
                disabled={busy !== null}
                className="px-3 py-2 text-xs text-red-700 hover:bg-red-50 rounded font-bold disabled:opacity-50"
              >
                Remove video
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => vidInput.current?.click()}
            disabled={busy !== null}
            className="px-4 py-2 text-sm font-bold rounded-full border border-primary text-primary hover:bg-primary hover:text-cream transition disabled:opacity-50"
          >
            {busy === 'video' ? 'Uploading…' : 'Upload video'}
          </button>
        )}

        <input
          ref={vidInput}
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          onChange={onVideoFile}
          className="hidden"
        />
        <p className="mt-2 text-xs text-gray-400">
          MP4, WebM or MOV · max 15 MB · {MAX_VIDEO_SECONDS} seconds max (checked
          on upload).
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </p>
      )}
    </div>
  );
}
