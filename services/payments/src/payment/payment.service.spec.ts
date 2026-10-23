import { Prisma } from '../../generated/prisma';
import { PaymentService } from './payment.service';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

function configService(failureRate?: string) {
  return { get: jest.fn().mockReturnValue(failureRate) } as never;
}

describe('PaymentService', () => {
  let prisma: {
    payment: { create: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock };
    outboxMessage: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      payment: { create: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
      outboxMessage: { create: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
  });

  it('confirms the payment and writes a PaymentConfirmed outbox event when the random roll succeeds', async () => {
    const service = new PaymentService(prisma as never, configService('0'));
    prisma.payment.create.mockResolvedValue(undefined);

    await service.handleInventoryReserved('event-1', 'c1', 'order-1');

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        correlationId: 'c1',
        triggeringEventId: 'event-1',
        status: 'PENDING',
      },
    });
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      data: { status: 'CONFIRMED', providerReference: expect.any(String) as unknown },
    });
    const outboxCalls = prisma.outboxMessage.create.mock.calls as [
      { data: { type: string; payload: { orderId: string; paymentId: string } } },
    ][];
    const outboxCall = outboxCalls[0][0];
    expect(outboxCall.data.type).toBe('PaymentConfirmed');
    expect(outboxCall.data.payload.orderId).toBe('order-1');
    expect(typeof outboxCall.data.payload.paymentId).toBe('string');
  });

  it('fails the payment and writes a PaymentFailed outbox event when the random roll fails', async () => {
    const service = new PaymentService(prisma as never, configService('1'));
    prisma.payment.create.mockResolvedValue(undefined);

    await service.handleInventoryReserved('event-1', 'c1', 'order-1');

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      data: { status: 'FAILED', failureReason: expect.any(String) as unknown },
    });
    const outboxCalls = prisma.outboxMessage.create.mock.calls as [
      { data: { type: string; payload: { orderId: string; reason: string } } },
    ][];
    const outboxCall = outboxCalls[0][0];
    expect(outboxCall.data.type).toBe('PaymentFailed');
    expect(outboxCall.data.payload.orderId).toBe('order-1');
  });

  it('is a no-op for a redelivered event once the order already has a terminal payment', async () => {
    const service = new PaymentService(prisma as never, configService('0'));
    prisma.payment.create.mockRejectedValue(p2002());
    prisma.payment.findUniqueOrThrow.mockResolvedValue({ status: 'CONFIRMED' });

    await service.handleInventoryReserved('event-2', 'c1', 'order-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('retries the charge for an order stuck PENDING (simulated crash recovery)', async () => {
    const service = new PaymentService(prisma as never, configService('0'));
    prisma.payment.create.mockRejectedValue(p2002());
    prisma.payment.findUniqueOrThrow.mockResolvedValue({ status: 'PENDING' });

    await service.handleInventoryReserved('event-2', 'c1', 'order-1');

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      data: { status: 'CONFIRMED', providerReference: expect.any(String) as unknown },
    });
  });

  it('rethrows a database error unrelated to the idempotency key', async () => {
    const service = new PaymentService(prisma as never, configService('0'));
    prisma.payment.create.mockRejectedValue(new Error('connection lost'));

    await expect(service.handleInventoryReserved('event-1', 'c1', 'order-1')).rejects.toThrow(
      'connection lost',
    );
  });

  it('falls back to the default failure rate when PAYMENT_FAILURE_RATE is not a number', async () => {
    const service = new PaymentService(prisma as never, configService(undefined));
    prisma.payment.create.mockResolvedValue(undefined);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

    await service.handleInventoryReserved('event-1', 'c1', 'order-1');

    // default rate is 0.3; 0.5 >= 0.3 means confirmed
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      data: { status: 'CONFIRMED', providerReference: expect.any(String) as unknown },
    });
    randomSpy.mockRestore();
  });
});
