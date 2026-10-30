import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  const makeService = (overrides: Record<string, jest.Mock> = {}) => {
    const prisma = {
      product: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      drop: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
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

  describe('createDrop', () => {
    const validInput = {
      name: 'Summer drop',
      opensAt: '2026-06-02T00:00:00Z',
      closesAt: '2026-06-03T00:00:00Z',
    };

    it('rejects an empty name', async () => {
      const { service } = makeService();
      await expect(service.createDrop({ ...validInput, name: '' })).rejects.toThrow(
        'name is required',
      );
    });

    it('rejects invalid dates', async () => {
      const { service } = makeService();
      await expect(service.createDrop({ ...validInput, opensAt: 'not-a-date' })).rejects.toThrow(
        'must be valid dates',
      );
    });

    it('rejects closesAt at or before opensAt', async () => {
      const { service } = makeService();
      await expect(
        service.createDrop({
          ...validInput,
          opensAt: '2026-06-03T00:00:00Z',
          closesAt: '2026-06-03T00:00:00Z',
        }),
      ).rejects.toThrow('closesAt must be after opensAt');
    });

    it('creates the drop when input is valid', async () => {
      const { service, prisma } = makeService();
      prisma.drop.create.mockResolvedValue({ id: 'drop-1', ...validInput });

      await service.createDrop(validInput);

      expect(prisma.drop.create).toHaveBeenCalledWith({
        data: {
          name: 'Summer drop',
          opensAt: new Date(validInput.opensAt),
          closesAt: new Date(validInput.closesAt),
        },
      });
    });
  });

  describe('createProduct', () => {
    const validInput = { name: 'Tee', priceCents: 2500 };

    it('rejects an empty name', async () => {
      const { service } = makeService();
      await expect(service.createProduct({ ...validInput, name: '' })).rejects.toThrow(
        'name is required',
      );
    });

    it('rejects a non-positive priceCents', async () => {
      const { service } = makeService();
      await expect(service.createProduct({ ...validInput, priceCents: 0 })).rejects.toThrow(
        'priceCents must be a positive whole number',
      );
    });

    it('rejects a non-integer priceCents', async () => {
      const { service } = makeService();
      await expect(service.createProduct({ ...validInput, priceCents: 10.5 })).rejects.toThrow(
        'priceCents must be a positive whole number',
      );
    });

    it('rejects an unknown dropId', async () => {
      const { service, prisma } = makeService();
      prisma.drop.findUnique.mockResolvedValue(null);

      await expect(service.createProduct({ ...validInput, dropId: 'missing' })).rejects.toThrow(
        'no drop with id missing',
      );
    });

    it('creates the product when input is valid, defaulting optional fields to null', async () => {
      const { service, prisma } = makeService();
      prisma.product.create.mockResolvedValue({ id: 'product-1', ...validInput });

      await service.createProduct(validInput);

      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          name: 'Tee',
          description: null,
          priceCents: 2500,
          imageUrl: null,
          dropId: null,
        },
      });
    });

    it('creates the product against a real dropId once confirmed to exist', async () => {
      const { service, prisma } = makeService();
      prisma.drop.findUnique.mockResolvedValue({ id: 'drop-1' });
      prisma.product.create.mockResolvedValue({ id: 'product-1', ...validInput, dropId: 'drop-1' });

      await service.createProduct({ ...validInput, dropId: 'drop-1' });

      const createCalls = prisma.product.create.mock.calls as [{ data: { dropId: string } }][];
      expect(createCalls[0][0].data.dropId).toBe('drop-1');
    });
  });

  describe('updateDrop', () => {
    const existing = drop('2026-06-02T00:00:00Z', '2026-06-03T00:00:00Z');

    it('throws NotFoundException for an unknown drop', async () => {
      const { service, prisma } = makeService();
      prisma.drop.findUnique.mockResolvedValue(null);

      await expect(service.updateDrop('missing', { name: 'x' })).rejects.toThrow(
        'no drop with id missing',
      );
    });

    it('rejects clearing the name', async () => {
      const { service, prisma } = makeService();
      prisma.drop.findUnique.mockResolvedValue(existing);

      await expect(service.updateDrop('drop-1', { name: '' })).rejects.toThrow('name is required');
    });

    it('validates the merged opensAt/closesAt, not just whatever was provided', async () => {
      const { service, prisma } = makeService();
      prisma.drop.findUnique.mockResolvedValue(existing);

      // Only lowering closesAt — but the existing opensAt (2026-06-02) makes this invalid.
      await expect(
        service.updateDrop('drop-1', { closesAt: '2026-06-01T00:00:00Z' }),
      ).rejects.toThrow('closesAt must be after opensAt');
    });

    it('updates only the given field, leaving the rest as stored', async () => {
      const { service, prisma } = makeService();
      prisma.drop.findUnique.mockResolvedValue(existing);
      prisma.drop.update.mockResolvedValue({ ...existing, name: 'Winter drop' });

      await service.updateDrop('drop-1', { name: 'Winter drop' });

      expect(prisma.drop.update).toHaveBeenCalledWith({
        where: { id: 'drop-1' },
        data: {
          name: 'Winter drop',
          opensAt: existing.opensAt,
          closesAt: existing.closesAt,
        },
      });
    });
  });

  describe('updateProduct', () => {
    const existing = {
      id: 'product-1',
      name: 'Tee',
      description: 'A shirt',
      priceCents: 2500,
      imageUrl: 'https://example.com/tee.png',
      dropId: 'drop-1',
    };

    it('throws NotFoundException for an unknown product', async () => {
      const { service, prisma } = makeService();
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.updateProduct('missing', { name: 'x' })).rejects.toThrow(
        'no product with id missing',
      );
    });

    it('rejects a non-positive priceCents', async () => {
      const { service, prisma } = makeService();
      prisma.product.findUnique.mockResolvedValue(existing);

      await expect(service.updateProduct('product-1', { priceCents: 0 })).rejects.toThrow(
        'priceCents must be a positive whole number',
      );
    });

    it('rejects an unknown dropId', async () => {
      const { service, prisma } = makeService();
      prisma.product.findUnique.mockResolvedValue(existing);
      prisma.drop.findUnique.mockResolvedValue(null);

      await expect(service.updateProduct('product-1', { dropId: 'missing' })).rejects.toThrow(
        'no drop with id missing',
      );
    });

    it('leaves unspecified fields untouched', async () => {
      const { service, prisma } = makeService();
      prisma.product.findUnique.mockResolvedValue(existing);
      prisma.product.update.mockResolvedValue({ ...existing, priceCents: 3000 });

      await service.updateProduct('product-1', { priceCents: 3000 });

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: {
          name: existing.name,
          description: existing.description,
          priceCents: 3000,
          imageUrl: existing.imageUrl,
          dropId: existing.dropId,
        },
      });
    });

    it('clears description when explicitly set to null', async () => {
      const { service, prisma } = makeService();
      prisma.product.findUnique.mockResolvedValue(existing);
      prisma.product.update.mockResolvedValue({ ...existing, description: null });

      await service.updateProduct('product-1', { description: null });

      const updateCalls = prisma.product.update.mock.calls as [{ data: { description: null } }][];
      expect(updateCalls[0][0].data.description).toBeNull();
    });

    it('unassigns from its drop when dropId is explicitly set to null', async () => {
      const { service, prisma } = makeService();
      prisma.product.findUnique.mockResolvedValue(existing);
      prisma.product.update.mockResolvedValue({ ...existing, dropId: null });

      await service.updateProduct('product-1', { dropId: null });

      const updateCalls = prisma.product.update.mock.calls as [{ data: { dropId: null } }][];
      expect(updateCalls[0][0].data.dropId).toBeNull();
      expect(prisma.drop.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('deleteProduct', () => {
    it('throws NotFoundException for an unknown product', async () => {
      const { service, prisma } = makeService();
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.deleteProduct('missing')).rejects.toThrow('no product with id missing');
      expect(prisma.product.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing product', async () => {
      const { service, prisma } = makeService();
      prisma.product.findUnique.mockResolvedValue({ id: 'product-1' });

      await service.deleteProduct('product-1');

      expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'product-1' } });
    });
  });
});
