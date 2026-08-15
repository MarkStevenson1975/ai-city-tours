'use client';

// Shrink and compress an image in the browser before it is uploaded, so the
// file we store (and every visitor downloads on their phone) is small and fast.
// It resizes to a sensible maximum width and re-encodes as JPEG at good quality.
//
// Safe by design: returns the original file untouched if it is not an image, if
// it is an animated GIF, if anything goes wrong, or if compressing would not
// actually make it smaller. So a caller can always just use whatever it returns.
export async function compressImage(
  file: File,
  opts?: { maxWidth?: number; quality?: number }
): Promise<File> {
  const maxWidth = opts?.maxWidth ?? 1600;
  const quality = opts?.quality ?? 0.82;

  if (typeof document === 'undefined') return file;
  if (!file.type.startsWith('image/')) return file;
  if (file.type === 'image/gif') return file; // keep animation

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('read failed'));
      fr.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('decode failed'));
      im.src = dataUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return file;

    const scale = srcW > maxWidth ? maxWidth / srcW : 1;
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // White backing so a transparent PNG does not turn black once it is JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    if (!blob || blob.size >= file.size) return file; // already small enough

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
