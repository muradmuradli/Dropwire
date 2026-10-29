import { createServer, Server } from 'node:http';
import { generateKeyPairSync, KeyObject, randomUUID } from 'node:crypto';
import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/s3/s3.service';

// Same throwaway-JWKS technique as orders'/gateway's own e2e tests — drives the real
// JwtStrategy/JwtAuthGuard/RolesGuard code without needing a live Keycloak. S3Service itself is
// stubbed (see beforeAll) — generating a real presigned URL needs real-looking AWS credentials
// the test environment doesn't have, and this suite's job is proving the route's auth/validation
// wiring, not S3 signing (that's covered by s3.service.spec.ts's own mocked-signer unit tests).
describe('Catalog admin-write (e2e)', () => {
  const REALM = 'test-realm';
  const KID = 'test-key-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let jwksServer: Server;
  let issuer: string;
  let privateKeyPem: string;
  const seededDropIds: string[] = [];
  const seededProductIds: string[] = [];

  beforeAll(async () => {
    const { publicKey, privateKey }: { publicKey: KeyObject; privateKey: KeyObject } =
      generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
    const jwk = publicKey.export({ format: 'jwk' }) as Record<string, string>;

    jwksServer = createServer((req, res) => {
      if (req.url === `/realms/${REALM}/protocol/openid-connect/certs`) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, use: 'sig', alg: 'RS256' }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
    const { port } = jwksServer.address() as { port: number };
    const keycloakUrl = `http://127.0.0.1:${port}`;
    issuer = `${keycloakUrl}/realms/${REALM}`;

    process.env.KEYCLOAK_URL = keycloakUrl;
    process.env.KEYCLOAK_REALM = REALM;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(S3Service)
      .useValue({
        createUploadUrl: (filename: string, contentType: string) => {
          if (!filename) {
            throw new BadRequestException('filename is required');
          }
          if (!contentType?.startsWith('image/')) {
            throw new BadRequestException('contentType must be an image/* type');
          }
          return Promise.resolve({
            uploadUrl: 'https://stub.example/upload',
            publicUrl: 'https://stub.example/products/stub.png',
          });
        },
      })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: seededProductIds } } });
    await prisma.drop.deleteMany({ where: { id: { in: seededDropIds } } });
    await app.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  function signToken(sub: string, roles: string[]): string {
    return jwt.sign({ sub, realm_access: { roles } }, privateKeyPem, {
      algorithm: 'RS256',
      issuer,
      keyid: KID,
      expiresIn: '5m',
    });
  }

  const adminToken = () => signToken(`e2e-admin-${randomUUID()}`, ['admin']);
  const customerToken = () => signToken(`e2e-customer-${randomUUID()}`, ['customer']);

  describe('POST /drops', () => {
    const validDrop = {
      name: 'E2E test drop',
      opensAt: '2026-06-01T00:00:00Z',
      closesAt: '2026-06-02T00:00:00Z',
    };

    it('rejects a request with no token', () => {
      return request(app.getHttpServer()).post('/drops').send(validDrop).expect(401);
    });

    it('rejects a customer-role token with 403', () => {
      return request(app.getHttpServer())
        .post('/drops')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send(validDrop)
        .expect(403);
    });

    it('creates a real drop for an admin-role token', async () => {
      const res = await request(app.getHttpServer())
        .post('/drops')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validDrop)
        .expect(201);

      const body = res.body as { id: string; name: string };
      seededDropIds.push(body.id);
      expect(body.name).toBe('E2E test drop');

      const stored = await prisma.drop.findUnique({ where: { id: body.id } });
      expect(stored?.name).toBe('E2E test drop');
    });

    it('rejects closesAt before opensAt with 400', () => {
      return request(app.getHttpServer())
        .post('/drops')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validDrop, opensAt: validDrop.closesAt, closesAt: validDrop.opensAt })
        .expect(400);
    });
  });

  describe('POST /products', () => {
    const validProduct = { name: 'E2E test product', priceCents: 1500 };

    it('rejects a request with no token', () => {
      return request(app.getHttpServer()).post('/products').send(validProduct).expect(401);
    });

    it('rejects a customer-role token with 403', () => {
      return request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send(validProduct)
        .expect(403);
    });

    it('creates a real product for an admin-role token', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validProduct)
        .expect(201);

      const body = res.body as { id: string; priceCents: number; dropId: string | null };
      seededProductIds.push(body.id);
      expect(body.priceCents).toBe(1500);
      expect(body.dropId).toBeNull();
    });

    it('rejects a non-positive priceCents with 400', () => {
      return request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validProduct, priceCents: 0 })
        .expect(400);
    });

    it('rejects an unknown dropId with 404', () => {
      return request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validProduct, dropId: randomUUID() })
        .expect(404);
    });
  });

  describe('POST /products/upload-url', () => {
    const validRequest = { filename: 'photo.png', contentType: 'image/png' };

    it('rejects a request with no token', () => {
      return request(app.getHttpServer())
        .post('/products/upload-url')
        .send(validRequest)
        .expect(401);
    });

    it('rejects a customer-role token with 403', () => {
      return request(app.getHttpServer())
        .post('/products/upload-url')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send(validRequest)
        .expect(403);
    });

    it('returns an uploadUrl/publicUrl pair for an admin-role token', async () => {
      const res = await request(app.getHttpServer())
        .post('/products/upload-url')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validRequest)
        .expect(201);

      const body = res.body as { uploadUrl: string; publicUrl: string };
      expect(body.uploadUrl).toBe('https://stub.example/upload');
      expect(body.publicUrl).toBe('https://stub.example/products/stub.png');
    });

    it('rejects a non-image contentType with 400', () => {
      return request(app.getHttpServer())
        .post('/products/upload-url')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validRequest, contentType: 'application/pdf' })
        .expect(400);
    });
  });
});
