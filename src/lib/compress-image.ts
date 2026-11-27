/**
 * Client-side image compression using the Canvas API.
 * Compresses images to JPEG at the specified quality and max dimension.
 * No external dependencies required.
 */
export async function compressImage(
  file: File,
  options?: { maxSizeKB?: number; quality?: number; maxDimension?: number }
): Promise<File> {
  const { maxSizeKB = 500, quality: initialQuality = 0.7, maxDimension = 1920 } = options ?? {};

  // Skip non-image files
  if (!file.type.startsWith("image/")) return file;

  // Skip already-small files
  if (file.size <= maxSizeKB * 1024) return file;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  // Scale down if larger than maxDimension
  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Iteratively reduce quality until under maxSizeKB
  let quality = initialQuality;
  let blob = await canvas.convertToBlob({ type: "image/jpeg", quality });

  while (blob.size > maxSizeKB * 1024 && quality > 0.1) {
    quality -= 0.1;
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  const compressedName = file.name.replace(/\.[^.]+$/, ".jpg");
  return new File([blob], compressedName, { type: "image/jpeg" });
}
