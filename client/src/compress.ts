/**
 * Same limit as the storage policy. Storage refuses a bigger upload by dropping the connection,
 * which the browser only reports as a network error, so check before uploading.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 2000;

/** Camera photo → JPEG, longest edge 2000 px, quality 0.80 (02-ARCHITECTURE.md §8). */
export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('Could not read this photo. Try another one.');
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  if (!blob) throw new Error('Could not read this photo. Try another one.');
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Photo is too large even after shrinking. Try a closer shot.');
  return blob;
}

/** Presigned POST straight to storage, through the same-origin bucket path (Vite proxy / Nginx). */
export async function uploadPhoto(target: { url: string; fields: Record<string, string> }, photo: Blob) {
  const form = new FormData();
  for (const [key, value] of Object.entries(target.fields)) form.append(key, value);
  form.append('file', photo); // must come after the policy fields
  const res = await fetch(new URL(target.url).pathname, { method: 'POST', body: form }).catch(() => {
    throw new Error('Upload failed. Check your connection and try again.');
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}). Try again.`);
}
