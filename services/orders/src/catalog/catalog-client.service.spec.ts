import { CatalogClient } from './catalog-client.service';

// global.fetch's real type is strict enough that assigning a jest mock directly flags either
// "unnecessary assertion" or "unsafe assignment" depending on the exact mock shape involved —
// casting global itself to a narrower { fetch: unknown } shape sidesteps both, since assigning
// anything to `unknown` is always safe. Same pattern as gateway's proxy.service.spec.ts.
const installFetchMock = (mock: jest.Mock): void => {
  (global as unknown as { fetch: unknown }).fetch = mock;
};

function fakeConfig(values: Record<string, string> = {}) {
  return { get: (key: string) => values[key] } as never;
}

describe('CatalogClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns true when catalog responds 200', async () => {
    installFetchMock(jest.fn().mockResolvedValue({ status: 200, ok: true }));
    const client = new CatalogClient(fakeConfig());

    await expect(client.productExists('p1')).resolves.toBe(true);
  });

  it('returns false on a definitive 404', async () => {
    installFetchMock(jest.fn().mockResolvedValue({ status: 404, ok: false }));
    const client = new CatalogClient(fakeConfig());

    await expect(client.productExists('p1')).resolves.toBe(false);
  });

  it('throws on a non-404 error status, rather than treating it as "does not exist"', async () => {
    installFetchMock(jest.fn().mockResolvedValue({ status: 500, ok: false }));
    const client = new CatalogClient(fakeConfig());

    await expect(client.productExists('p1')).rejects.toThrow('catalog returned 500');
  });

  it('lets a network failure propagate', async () => {
    installFetchMock(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const client = new CatalogClient(fakeConfig());

    await expect(client.productExists('p1')).rejects.toThrow('ECONNREFUSED');
  });

  it('calls the configured CATALOG_URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true });
    installFetchMock(fetchMock);
    const client = new CatalogClient(fakeConfig({ CATALOG_URL: 'http://catalog.internal' }));

    await client.productExists('p1');

    expect(fetchMock).toHaveBeenCalledWith('http://catalog.internal/products/p1');
  });

  it('falls back to localhost:3001 when CATALOG_URL is not configured', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true });
    installFetchMock(fetchMock);
    const client = new CatalogClient(fakeConfig());

    await client.productExists('p1');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/products/p1');
  });
});
