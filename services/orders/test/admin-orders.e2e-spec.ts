import { createServer, Server } from 'node:http';
import { generateKeyPairSync, KeyObject, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Same throwaway-JWKS technique as orders-history.e2e-spec.ts. Covers auth/role gating and
// the DB-only parts of the admin worklist (list, cancel). retryReservation's gRPC outcomes
// (RESERVED/CANCELLED/stays RESERVATION_FAILED) are already covered by unit tests with a
// mocked inventory client — exercising a real successful retry here would need a real
// reachable product+stock in inventory, which is a live-verification concern, not this
// test's job.
describe('Admin orders (e2e)', () => {
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

  async function seedOrder(status: 'RESERVATION_FAILED' | 'CONFIRMED') {
    const order = await prisma.order.create({
      data: {
        id: randomUUID(),
        customerId: `e2e-customer-${randomUUID()}`,
        correlationId: randomUUID(),
        status,
        items: { create: [{ productId: 'e2e-test-product', quantity: 1 }] },
      },
    });
    seededOrderIds.push(order.id);
    return order;
  }

  describe('GET /admin/orders', () => {
    it('rejects a request with no token', () => {
      return request(app.getHttpServer()).get('/admin/orders').expect(401);
    });

    it('rejects a customer-role token with 403', () => {
      return request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${customerToken()}`)
        .expect(403);
    });

    it('defaults to RESERVATION_FAILED and excludes other statuses', async () => {
      const stuck = await seedOrder('RESERVATION_FAILED');
      const confirmed = await seedOrder('CONFIRMED');

      const res = await request(app.getHttpServer())
        .get('/admin/orders')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      const ids = (res.body as Array<{ id: string }>).map((o) => o.id);
      expect(ids).toContain(stuck.id);
      expect(ids).not.toContain(confirmed.id);
    });

    it('rejects an unknown status', () => {
      return request(app.getHttpServer())
        .get('/admin/orders?status=NOT_A_REAL_STATUS')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(400);
    });
  });

  describe('POST /admin/orders/:orderId/cancel', () => {
    it('rejects a customer-role token with 403', async () => {
      const order = await seedOrder('RESERVATION_FAILED');
      return request(app.getHttpServer())
        .post(`/admin/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${customerToken()}`)
        .expect(403);
    });

    it('cancels a RESERVATION_FAILED order and writes an OrderCancelled outbox event', async () => {
      const order = await seedOrder('RESERVATION_FAILED');

      const res = await request(app.getHttpServer())
        .post(`/admin/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(201);

      expect((res.body as { status: string }).status).toBe('CANCELLED');

      const outbox = await prisma.outboxMessage.findFirst({
        where: { type: 'OrderCancelled', payload: { path: ['orderId'], equals: order.id } },
      });
      expect(outbox).not.toBeNull();
    });

    it('rejects an order that is not RESERVATION_FAILED with 409', async () => {
      const order = await seedOrder('CONFIRMED');

      return request(app.getHttpServer())
        .post(`/admin/orders/${order.id}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(409);
    });

    it('returns 404 for an unknown order', () => {
      return request(app.getHttpServer())
        .post(`/admin/orders/${randomUUID()}/cancel`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(404);
    });
  });

  describe('POST /admin/orders/:orderId/retry', () => {
    it('rejects a customer-role token with 403', async () => {
      const order = await seedOrder('RESERVATION_FAILED');
      return request(app.getHttpServer())
        .post(`/admin/orders/${order.id}/retry`)
        .set('Authorization', `Bearer ${customerToken()}`)
        .expect(403);
    });
  });
});
