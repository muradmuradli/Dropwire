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
      type: 'PaymentConfirmed',
      version: 1,
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      correlationId: 'c1',
      payload: { orderId: 'order-1', paymentId: 'pay-1' },
      publishedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('does nothing when there are no pending messages', async () => {
    await service.relay();

    expect(producer.send).not.toHaveBeenCalled();
  });

  it('publishes PaymentConfirmed to payment.confirmed, keyed by orderId, and marks it published', async () => {
    prisma.outboxMessage.findMany.mockResolvedValue([message()]);

    await service.relay();

    expect(producer.send).toHaveBeenCalledWith('payment.confirmed', 'order-1', expect.any(String));
    expect(prisma.outboxMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { publishedAt: expect.any(Date) as unknown },
    });
  });

  it('maps PaymentFailed to its own topic', async () => {
    prisma.outboxMessage.findMany.mockResolvedValue([
      message({
        type: 'PaymentFailed',
        payload: { orderId: 'order-1', reason: 'simulated decline' },
      }),
    ]);

    await service.relay();

    expect(producer.send).toHaveBeenCalledWith('payment.failed', 'order-1', expect.any(String));
  });

  it('stops the tick on a publish failure, leaving the message unmarked', async () => {
    prisma.outboxMessage.findMany.mockResolvedValue([message()]);
    producer.send.mockRejectedValueOnce(new Error('broker unreachable'));

    await service.relay();

    expect(prisma.outboxMessage.update).not.toHaveBeenCalled();
  });
});
