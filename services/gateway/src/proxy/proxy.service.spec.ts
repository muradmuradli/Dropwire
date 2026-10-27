import type { Request, Response } from 'express';
import { Registry } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service';
import { ProxyService } from './proxy.service';

function fakeMetrics() {
  return { registry: new Registry() } as unknown as MetricsService;
}

describe('ProxyService', () => {
  const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  const makeRequest = (overrides: { headers?: Record<string, string> } = {}) => ({
    headers: {},
    ...overrides,
  });

  // global.fetch's real type is strict enough that assigning a jest mock directly flags
  // either "unnecessary assertion" or "unsafe assignment" depending on the exact mock shape
  // involved — casting global itself to a narrower { fetch: unknown } shape sidesteps both,
  // since assigning anything to `unknown` is always safe.
  const installFetchMock = (mock: jest.Mock): void => {
    (global as unknown as { fetch: unknown }).fetch = mock;
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards method, path, and body to the upstream URL', async () => {
    const service = new ProxyService(fakeMetrics());
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{"ok":true}'),
      headers: { get: () => 'application/json' },
    });
    installFetchMock(fetchMock);
    const response = makeResponse();

    await service.forward(
      'http://localhost:3003',
      'orders',
      'POST',
      '/orders',
      makeRequest() as unknown as Request,
      response as unknown as Response,
      { items: [] },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3003/orders',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ items: [] }) }),
    );
    expect(response.status.mock.calls[0]).toEqual([200]);
    expect(response.send.mock.calls[0]).toEqual(['{"ok":true}']);
  });

  it('forwards the Authorization header unchanged when present', async () => {
    const service = new ProxyService(fakeMetrics());
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    installFetchMock(fetchMock);

    await service.forward(
      'http://localhost:3001',
      'catalog',
      'GET',
      '/products',
      makeRequest({ headers: { authorization: 'Bearer abc' } }) as unknown as Request,
      makeResponse() as unknown as Response,
    );

    const sentHeaders = (
      fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
    )[1].headers;
    expect(sentHeaders.authorization).toBe('Bearer abc');
  });

  it('does not add an Authorization header when the request has none', async () => {
    const service = new ProxyService(fakeMetrics());
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      text: () => Promise.resolve('{}'),
      headers: { get: () => 'application/json' },
    });
    installFetchMock(fetchMock);

    await service.forward(
      'http://localhost:3001',
      'catalog',
      'GET',
      '/products',
      makeRequest() as unknown as Request,
      makeResponse() as unknown as Response,
    );

    const sentHeaders = (
      fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }]
    )[1].headers;
    expect(sentHeaders.authorization).toBeUndefined();
  });

  it('returns a 503 naming the upstream service when fetch rejects', async () => {
    installFetchMock(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const service = new ProxyService(fakeMetrics());
    const response = makeResponse();

    await service.forward(
      'http://localhost:3001',
      'catalog',
      'GET',
      '/products',
      makeRequest() as unknown as Request,
      response as unknown as Response,
    );

    const jsonArg = (
      response.json.mock.calls as [{ error: { code: number; message: string } }][]
    )[0][0];
    expect(response.status.mock.calls[0]).toEqual([503]);
    expect(jsonArg.error.code).toBe(503);
    expect(jsonArg.error.message).toBe('catalog service is unreachable');
  });
});
