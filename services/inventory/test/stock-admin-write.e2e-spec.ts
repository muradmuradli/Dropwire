import { createServer, Server } from 'node:http';
import { generateKeyPairSync, KeyObject, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

// Same throwaway-JWKS technique as catalog's/orders'/gateway's own e2e tests — drives the real
// JwtStrategy/JwtAuthGuard/RolesGuard code without needing a live Keycloak. Real inventory-db and
// real Redis — this suite's whole point is proving POST /stock actually reaches both, which is
// exactly the gap that caused the "item no longer available" bug this feature fixes (see
// docs/decisions/0035).
describe('Inventory admin-write (e2e)', () => {
  const REALM = 'test-realm';
  const KID = 'test-key-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let jwksServer: Server;
  let issuer: string;
  let privateKeyPem: string;
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
    redis = moduleFixture.get(RedisService);
  });

  afterAll(async () => {
    await prisma.stock.deleteMany({ where: { productId: { in: seededProductIds } } });
    if (seededProductIds.length > 0) {
      await redis.del(...seededProductIds.map((id) => `stock:${id}`));
    }
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

  describe('POST /stock', () => {
    it('rejects a request with no token', () => {
      return request(app.getHttpServer())
        .post('/stock')
        .send({ productId: randomUUID(), quantity: 10 })
        .expect(401);
    });

    it('rejects a customer-role token with 403', () => {
      return request(app.getHttpServer())
        .post('/stock')
        .set('Authorization', `Bearer ${customerToken()}`)
        .send({ productId: randomUUID(), quantity: 10 })
        .expect(403);
    });

    it('rejects a negative quantity with 400', () => {
      return request(app.getHttpServer())
        .post('/stock')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ productId: randomUUID(), quantity: -1 })
        .expect(400);
    });

    it('provisions real stock in both Postgres and Redis for an admin-role token', async () => {
      const productId = randomUUID();
      seededProductIds.push(productId);

      const res = await request(app.getHttpServer())
        .post('/stock')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ productId, quantity: 25 })
        .expect(201);

      expect((res.body as { totalQuantity: number }).totalQuantity).toBe(25);

      const stored = await prisma.stock.findUnique({ where: { productId } });
      expect(stored?.totalQuantity).toBe(25);

      const cached = await redis.get(`stock:${productId}`);
      expect(cached).toBe('25');
    });

    it('is an upsert — re-setting stock for the same product updates it instead of erroring', async () => {
      const productId = randomUUID();
      seededProductIds.push(productId);

      await request(app.getHttpServer())
        .post('/stock')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ productId, quantity: 10 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/stock')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ productId, quantity: 40 })
        .expect(201);

      expect((res.body as { totalQuantity: number }).totalQuantity).toBe(40);
      const cached = await redis.get(`stock:${productId}`);
      expect(cached).toBe('40');
    });
  });
});
