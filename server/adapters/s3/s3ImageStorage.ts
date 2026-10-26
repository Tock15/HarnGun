import { GetObjectCommand, NoSuchKey, type S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { MAX_UPLOAD_BYTES } from '@harngun/shared';
import type { ImageStorage, UploadTarget } from '../../ports';

const UPLOAD_EXPIRY_SECONDS = 300;

export class S3ImageStorage implements ImageStorage {
  /**
   * `signer` points at the address the browser uses (through Nginx in Docker); `s3` at the
   * internal one. A presigned POST is only valid for the host it was signed for.
   */
  constructor(
    private readonly s3: S3Client,
    private readonly signer: S3Client,
    private readonly bucket: string,
  ) {}

  async createUpload(key: string): Promise<UploadTarget> {
    const { url, fields } = await createPresignedPost(this.signer, {
      Bucket: this.bucket,
      Key: key,
      Expires: UPLOAD_EXPIRY_SECONDS,
      // Enforced by the storage server itself, so a modified client cannot bypass them.
      Conditions: [
        ['content-length-range', 1, MAX_UPLOAD_BYTES],
        ['eq', '$Content-Type', 'image/jpeg'],
      ],
      Fields: { 'Content-Type': 'image/jpeg' },
    });
    return { url, fields };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const { Body } = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Body ? await Body.transformToByteArray() : null;
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }
}
