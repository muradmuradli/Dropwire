import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  const makeService = (overrides: Record<string, jest.Mock> = {}) => {
    const prisma = {
      product: { findMany: jest.fn(), findUnique: jest.fn() },
      drop: { findMany: jest.fn(), findUnique: jest.fn() },
      ...overrides,
    };
    const service = new CatalogService(prisma as never);
    return { service, prisma };
  };

  const drop = (opensAt: string, closesAt: string) => ({
    id: 'drop-1',
    name: 'Summer drop',
    opensAt: new Date(opensAt),
    closesAt: new Date(closesAt),
    createdAt: now,
    updatedAt: now,
    products: [],
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('listProducts passes dropId through as a filter when given', async () => {
    const { service, prisma } = makeService();
    prisma.product.findMany.mockResolvedValue([]);

    await service.listProducts('drop-1');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dropId: 'drop-1' } }),
    );
  });

  it('listProducts omits the where clause entirely when no dropId is given', async () => {
    const { service, prisma } = makeService();
    prisma.product.findMany.mockResolvedValue([]);

    await service.listProducts();

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('getProduct returns null when prisma finds nothing', async () => {
    const { service, prisma } = makeService();
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(service.getProduct('missing')).resolves.toBeNull();
  });

  it('marks a drop UPCOMING before it opens', async () => {
    const { service, prisma } = makeService();
    prisma.drop.findUnique.mockResolvedValue(drop('2026-06-02T00:00:00Z', '2026-06-03T00:00:00Z'));

    const result = await service.getDrop('drop-1');

    expect(result?.status).toBe('UPCOMING');
  });

  it('marks a drop LIVE between opensAt and closesAt', async () => {
    const { service, prisma } = makeService();
    prisma.drop.findUnique.mockResolvedValue(drop('2026-05-31T00:00:00Z', '2026-06-02T00:00:00Z'));

    const result = await service.getDrop('drop-1');

    expect(result?.status).toBe('LIVE');
  });

  it('marks a drop ENDED once closesAt has passed, including exactly at closesAt', async () => {
    const { service, prisma } = makeService();
    prisma.drop.findUnique.mockResolvedValue(drop('2026-05-30T00:00:00Z', '2026-06-01T12:00:00Z'));

    const result = await service.getDrop('drop-1');

    expect(result?.status).toBe('ENDED');
  });

  it('getDrop returns null when prisma finds nothing', async () => {
    const { service, prisma } = makeService();
    prisma.drop.findUnique.mockResolvedValue(null);

    await expect(service.getDrop('missing')).resolves.toBeNull();
  });

  it('listDrops annotates every drop returned with a derived status', async () => {
    const { service, prisma } = makeService();
    prisma.drop.findMany.mockResolvedValue([
      drop('2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'),
      drop('2026-06-30T00:00:00Z', '2026-07-01T00:00:00Z'),
    ]);

    const result = await service.listDrops();

    expect(result.map((d) => d.status)).toEqual(['ENDED', 'UPCOMING']);
  });
});
