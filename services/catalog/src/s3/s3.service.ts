import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const UPLOAD_EXPIRES_SECONDS = 300;

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
}

// Presigned-URL upload, not a server-side proxy: apps/admin PUTs the file straight to S3 from
// the browser using the URL this returns — catalog never sees the file bytes. Generating a
// presigned URL is pure local SigV4 signing (no network call to AWS), so this works as soon as
// *some* credential values are present, real or not; the signature only gets checked once S3
// itself receives the PUT. See docs/decisions/0030 for the bucket-side CORS requirement this
// implies, which is on the user to configure, not something this code can set up.
@Injectable()
export class S3Service {
  // Built lazily, not in the constructor: S3Client validates `region` eagerly and throws at
  // construction time if it's missing — this service must not crash the whole app at boot just
  // because AWS_REGION isn't filled in yet (confirmed by hand: constructing it eagerly took the
  // entire service down on startup). Deferring construction to the first real call means the
  // service boots fine either way, and only a genuine upload attempt can fail on it.
  private client?: S3Client;

  constructor(private readonly config: ConfigService) {}

  async createUploadUrl(filename: string, contentType: string): Promise<PresignedUpload> {
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      throw new BadRequestException('filename is required');
    }
    if (typeof contentType !== 'string' || !contentType.startsWith('image/')) {
      throw new BadRequestException('contentType must be an image/* type');
    }

    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    const key = `products/${randomUUID()}-${this.sanitizeFilename(filename)}`;

    const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    const uploadUrl = await getSignedUrl(this.getClient(), command, {
      expiresIn: UPLOAD_EXPIRES_SECONDS,
    });

    const publicBase =
      this.config.get<string>('S3_PUBLIC_BASE_URL') ??
      `https://${bucket}.s3.${this.config.get<string>('AWS_REGION')}.amazonaws.com`;

    return { uploadUrl, publicUrl: `${publicBase}/${key}` };
  }

  // Keeps the key readable (unlike a bare UUID) without risking anything S3/URL-unsafe getting
  // into it — strips everything but alphanumerics, dot, dash, and underscore.
  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({ region: this.config.get<string>('AWS_REGION') });
    }
    return this.client;
  }
}
