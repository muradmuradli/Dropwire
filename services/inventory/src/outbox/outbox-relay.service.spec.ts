import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  let prisma: { outboxMessage: { findMany: jest.Mock; update: jest.Mock } };
  let producer: { send: jest.Mock };
  let service: OutboxRelayService;

  beforeEach(() => {
    prisma = {
      outboxMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    producer = { send: jest.fn().mockResolvedValue(undefined) };
    service = new OutboxRelayService(prisma as never, producer as never);
  });

  function message(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 'msg-1',
      type: 'InventoryReserved',
      version: 1,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      correlationId: 'c1',
      payload: { orderId: 'order-1', items: [{ productId: 'p1', quantity: 2 }] },
      publishedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('does nothing when there are no pending messages', async () => {
    await service.relay();

    expect(producer.send).not.toHaveBeenCalled();
    expect(prisma.outboxMessage.update).not.toHaveBeenCalled();
  });

  it('publishes a pending message to its mapped topic, keyed by orderId, and marks it published', async () => {
    prisma.outboxMessage.findMany.mockResolvedValue([message()]);

    await service.relay();

    expect(producer.send).toHaveBeenCalledWith(
      'inventory.reserved',
      'order-1',
      JSON.stringify({
        id: 'msg-1',
        type: 'InventoryReserved',
        version: 1,
        occurredAt: '2026-01-01T00:00:00.000Z',
        correlationId: 'c1',
        payload: { orderId: 'order-1', items: [{ productId: 'p1', quantity: 2 }] },
      }),
    );
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { publishedAt: expect.any(Date) as unknown },
    });
  });

  it('maps InventoryReleased to its own topic', async () => {
    prisma.outboxMessage.findMany.mockResolvedValue([message({ type: 'InventoryReleased' })]);

    await service.relay();

    expect(producer.send).toHaveBeenCalledWith('inventory.released', 'order-1', expect.any(String));
  });

  it('skips a message with no mapped topic without marking it published', async () => {
    prisma.outboxMessage.findMany.mockResolvedValue([message({ type: 'SomeUnknownEvent' })]);

    await service.relay();

    expect(producer.send).not.toHaveBeenCalled();
    expect(prisma.outboxMessage.update).not.toHaveBeenCalled();
  });

  it('stops the whole tick (not just skips) on a publish failure, leaving later messages unmarked', async () => {
    prisma.outboxMessage.findMany.mockResolvedValue([
      message({ id: 'msg-1' }),
      message({ id: 'msg-2' }),
    ]);
    producer.send.mockRejectedValueOnce(new Error('broker unreachable'));

    await service.relay();

    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(prisma.outboxMessage.update).not.toHaveBeenCalled();
  });

  it('falls back to the message id as the Kafka key when the payload has no orderId', async () => {
    prisma.outboxMessage.findMany.mockResolvedValue([message({ payload: { foo: 'bar' } })]);

    await service.relay();

    expect(producer.send).toHaveBeenCalledWith('inventory.reserved', 'msg-1', expect.any(String));
  });
});
