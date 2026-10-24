/** A presigned POST: the browser sends `fields` plus the file as multipart form data to `url`. */
export interface UploadTarget {
  url: string;
  fields: Record<string, string>;
}

export interface ImageStorage {
  /** Signs a direct browser upload to `key` (JPEG only, max 5 MB, short expiry). */
  createUpload(key: string): Promise<UploadTarget>;
  /** The stored image, or null if nothing was uploaded to `key`. */
  get(key: string): Promise<Uint8Array | null>;
}
