import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES, S3ImageStorage } from '../../../adapters/s3/s3ImageStorage';
import { createS3Client } from '../../../config';
import { integrationSetup } from '../../helpers/integration';

let storage: S3ImageStorage;

beforeAll(async () => {
  const { config, s3 } = await integrationSetup();
  storage = new S3ImageStorage(s3, createS3Client(config, config.s3PublicEndpoint), config.bucket);
});

/** Uploads like the browser will: multipart form with the signed fields first, the file last. */
async function browserUpload(key: string, bytes: Uint8Array<ArrayBuffer>, type = 'image/jpeg') {
  const { url, fields } = await storage.createUpload(key);
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, name === 'Content-Type' ? type : value);
  form.append('file', new Blob([bytes], { type }));
  return (await fetch(url, { method: 'POST', body: form })).status;
}

const newKey = () => `receipts/${randomUUID()}.jpg`;

describe('S3ImageStorage', () => {
  it('accepts a browser upload through the presigned POST and reads it back', async () => {
    const key = newKey();
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

    expect(await browserUpload(key, bytes)).toBe(204);
    expect(await storage.get(key)).toEqual(bytes);
  });

  it('rejects uploads over 5 MB', async () => {
    const key = newKey();

    expect(await browserUpload(key, new Uint8Array(MAX_UPLOAD_BYTES + 1))).toBeGreaterThanOrEqual(400);
    expect(await storage.get(key)).toBeNull();
  });

  it('rejects files that are not JPEG', async () => {
    const key = newKey();

    expect(await browserUpload(key, new Uint8Array(100), 'image/png')).toBeGreaterThanOrEqual(400);
    expect(await storage.get(key)).toBeNull();
  });

  it('returns null for a key nothing was uploaded to', async () => {
    expect(await storage.get(newKey())).toBeNull();
  });
});
