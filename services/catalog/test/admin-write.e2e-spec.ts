import { createServer, Server } from 'node:http';
import { generateKeyPairSync, KeyObject, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Same throwaway-JWKS technique as orders'/gateway's own e2e tests — drives the real
// JwtStrategy/JwtAuthGuard/RolesGuard code without needing a live Keycloak.
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
    }).compile();
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
});
