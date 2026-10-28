import { createServer, Server } from 'node:http';
import { generateKeyPairSync, KeyObject, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Same throwaway-JWKS technique as gateway's test/me.e2e-spec.ts — drives the real
// JwtStrategy/JwtAuthGuard code without needing a live Keycloak. Order fixtures are inserted
// directly via Prisma rather than through the full POST /orders → gRPC ReserveStock path,
// since this only needs to exercise GET /orders' ownership/ordering, not placement.
describe('Order history (e2e)', () => {
  const REALM = 'test-realm';
  const KID = 'test-key-1';

  let app: INestApplication;
  let prisma: PrismaService;
  let jwksServer: Server;
  let issuer: string;
  let privateKeyPem: string;
  const seededOrderIds: string[] = [];

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

    // Must be set before AppModule (and therefore JwtStrategy) is built — same reasoning as
    // me.e2e-spec.ts.
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
    await prisma.orderItem.deleteMany({ where: { orderId: { in: seededOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: seededOrderIds } } });
    await app.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  function signToken(sub: string): string {
    return jwt.sign({ sub, realm_access: { roles: ['customer'] } }, privateKeyPem, {
      algorithm: 'RS256',
      issuer,
      keyid: KID,
      expiresIn: '5m',
    });
  }

  async function seedOrder(customerId: string, createdAt: Date) {
    const order = await prisma.order.create({
      data: {
        id: randomUUID(),
        customerId,
        correlationId: randomUUID(),
        status: 'CONFIRMED',
        createdAt,
        items: { create: [{ productId: 'e2e-test-product', quantity: 1 }] },
      },
    });
    seededOrderIds.push(order.id);
    return order;
  }

  describe('GET /orders', () => {
    it('rejects a request with no token', () => {
      return request(app.getHttpServer()).get('/orders').expect(401);
    });

    it("only returns the caller's own orders, newest first", async () => {
      const customerA = `e2e-customer-a-${randomUUID()}`;
      const customerB = `e2e-customer-b-${randomUUID()}`;

      const older = await seedOrder(customerA, new Date(Date.now() - 60_000));
      const newer = await seedOrder(customerA, new Date());
      await seedOrder(customerB, new Date());

      const res = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${signToken(customerA)}`)
        .expect(200);

      const ids = (res.body as Array<{ id: string }>).map((o) => o.id);
      expect(ids).toEqual([newer.id, older.id]);
    });

    it('returns an empty list for a customer with no orders', async () => {
      const res = await request(app.getHttpServer())
        .get('/orders')
        .set('Authorization', `Bearer ${signToken(`e2e-customer-empty-${randomUUID()}`)}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });
});
