export * from './billDraft';

/** Largest receipt photo the storage policy accepts; the client checks it before uploading. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
