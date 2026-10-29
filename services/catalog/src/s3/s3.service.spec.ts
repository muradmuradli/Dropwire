import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Service } from './s3.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

function fakeConfig(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as never;
}

describe('S3Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an empty filename', async () => {
    const service = new S3Service(
      fakeConfig({ AWS_REGION: 'us-east-1', S3_BUCKET_NAME: 'bucket' }),
    );

    await expect(service.createUploadUrl('', 'image/png')).rejects.toThrow('filename is required');
  });

  it('rejects a non-image contentType', async () => {
    const service = new S3Service(
      fakeConfig({ AWS_REGION: 'us-east-1', S3_BUCKET_NAME: 'bucket' }),
    );

    await expect(service.createUploadUrl('photo.png', 'application/pdf')).rejects.toThrow(
      'contentType must be an image/* type',
    );
  });

  it('builds a products/<uuid>-<sanitized-filename> key and signs it', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example/upload');
    const service = new S3Service(
      fakeConfig({ AWS_REGION: 'us-east-1', S3_BUCKET_NAME: 'bucket' }),
    );

    const result = await service.createUploadUrl('my photo!.png', 'image/png');

    expect(result.uploadUrl).toBe('https://signed.example/upload');
    expect(result.publicUrl).toMatch(
      /^https:\/\/bucket\.s3\.us-east-1\.amazonaws\.com\/products\/[0-9a-f-]+-my_photo_\.png$/,
    );

    const signCall = (getSignedUrl as jest.Mock).mock.calls[0] as [
      unknown,
      { input: unknown },
      unknown,
    ];
    expect(signCall[1].input).toMatchObject({
      Bucket: 'bucket',
      ContentType: 'image/png',
    });
  });

  it('uses S3_PUBLIC_BASE_URL instead of the default bucket URL when set', async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue('https://signed.example/upload');
    const service = new S3Service(
      fakeConfig({
        AWS_REGION: 'us-east-1',
        S3_BUCKET_NAME: 'bucket',
        S3_PUBLIC_BASE_URL: 'https://cdn.example.com',
      }),
    );

    const result = await service.createUploadUrl('photo.png', 'image/png');

    expect(result.publicUrl).toMatch(/^https:\/\/cdn\.example\.com\/products\//);
  });
});
