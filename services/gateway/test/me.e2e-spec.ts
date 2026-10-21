import { createServer, Server } from 'node:http';
import { generateKeyPairSync, KeyObject } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Drives the real JwtStrategy/JwtAuthGuard/RolesGuard code against real HTTP requests —
// the thing this e2e test was originally skipped for. Rather than a live Keycloak (needs a
// browser for the real PKCE flow) or a password-grant test client (rejected in
// notes/PROGRESS.md — that would test a flow the real frontend never uses), this spins up a
// throwaway local HTTP server that serves a JWKS response for a key pair generated on the
// fly, and signs test tokens with the matching private key. The app's JwtStrategy makes a
// real HTTP call to fetch that JWKS, exactly as it would against real Keycloak.
describe('Me (e2e)', () => {
  const REALM = 'test-realm';
  const KID = 'test-key-1';

  let app: INestApplication;
  let jwksServer: Server;
  let issuer: string;
  let privateKeyPem: string;

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

    // Must be set before AppModule (and therefore ConfigModule/JwtStrategy) is built —
    // dotenv won't override an already-set process.env value, so this wins over .env's
    // real KEYCLOAK_URL/KEYCLOAK_REALM for the lifetime of this test file.
    process.env.KEYCLOAK_URL = keycloakUrl;
    process.env.KEYCLOAK_REALM = REALM;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  function signToken(payload: Record<string, unknown>): string {
    return jwt.sign(payload, privateKeyPem, {
      algorithm: 'RS256',
      issuer,
      keyid: KID,
      expiresIn: '5m',
    });
  }

  describe('GET /me', () => {
    it('rejects a request with no token', () => {
      return request(app.getHttpServer()).get('/me').expect(401);
    });

    it('rejects a garbage token', () => {
      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('rejects a token signed by a different key', () => {
      const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const token = jwt.sign({ sub: 'user-1' }, otherKey.export({ type: 'pkcs1', format: 'pem' }), {
        algorithm: 'RS256',
        issuer,
        keyid: KID,
        expiresIn: '5m',
      });
      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('accepts a valid token and returns the user', async () => {
      const token = signToken({ sub: 'user-1', realm_access: { roles: ['customer'] } });

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ userId: 'user-1', roles: ['customer'] });
    });
  });

  describe('GET /me/admin-only', () => {
    it('rejects a customer-role token with 403', async () => {
      const token = signToken({ sub: 'user-1', realm_access: { roles: ['customer'] } });

      await request(app.getHttpServer())
        .get('/me/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('rejects a request with no token with 401, not 403', () => {
      return request(app.getHttpServer()).get('/me/admin-only').expect(401);
    });

    it('accepts an admin-role token', async () => {
      const token = signToken({ sub: 'admin-1', realm_access: { roles: ['admin'] } });

      const res = await request(app.getHttpServer())
        .get('/me/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Hello admin admin-1' });
    });
  });
});
