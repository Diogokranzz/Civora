import { createReadStream, promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';

export interface StoragePort {
  putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  getSignedDownloadUrl(params: {
    key: string;
    fileName: string;
    expiresInSeconds?: number;
  }): Promise<string>;
  readStream(key: string): Promise<NodeJS.ReadableStream | null>;
}

@Injectable()
export class HybridStorageService implements StoragePort {
  private readonly provider: 's3' | 'local';
  private readonly s3Client: S3Client | null = null;
  private readonly bucket: string;
  private readonly localRoot: string;
  private bucketReady = false;

  constructor() {
    this.provider = process.env.STORAGE_PROVIDER === 's3' ? 's3' : 'local';
    this.bucket = process.env.S3_BUCKET || 'civora-attachments';
    this.localRoot = resolve(process.cwd(), '.civora-local-storage');

    if (this.provider === 's3' && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
      this.s3Client = new S3Client({
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        },
      });
    }
  }

  private async ensureBucket(): Promise<void> {
    if (!this.s3Client || this.bucketReady) return;
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketReady = true;
    } catch {
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch {
        // Bucket may have been created concurrently by another replica
      }
      this.bucketReady = true;
    }
  }

  async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void> {
    if (this.s3Client) {
      await this.ensureBucket();
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
        }),
      );
      return;
    }

    const safePath = this.resolveSafeLocalPath(params.key);
    await fs.mkdir(resolve(safePath, '..'), { recursive: true });
    await fs.writeFile(safePath, params.body);
  }

  async getSignedDownloadUrl(params: {
    key: string;
    fileName: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    if (this.s3Client) {
      const cmd = new GetObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(params.fileName)}"`,
      });
      return getSignedUrl(this.s3Client, cmd, { expiresIn: params.expiresInSeconds ?? 300 });
    }
    return '';
  }

  async readStream(key: string): Promise<NodeJS.ReadableStream | null> {
    if (this.s3Client) {
      const output = await this.s3Client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!output.Body) return null;
      return output.Body instanceof Readable
        ? output.Body
        : Readable.fromWeb(output.Body.transformToWebStream() as never);
    }

    const safePath = this.resolveSafeLocalPath(key);
    try {
      await fs.access(safePath);
      return createReadStream(safePath);
    } catch {
      return null;
    }
  }

  shouldRedirectSignedUrl(): boolean {
    return this.s3Client !== null && !process.env.S3_ENDPOINT?.includes('minio:');
  }

  private resolveSafeLocalPath(key: string): string {
    const normalized = key.replace(/^\/+/, '');
    const target = resolve(join(this.localRoot, normalized));
    if (!target.startsWith(this.localRoot)) {
      throw new Error('Invalid storage key path traversal attempt');
    }
    return target;
  }
}
