import { Registry } from 'prom-client';
import { Prisma } from '../../generated/prisma';
import { MetricsService } from '../metrics/metrics.service';
import { PaymentService } from './payment.service';

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
  });
}

// A fresh real Registry per call (not shared across the file's many PaymentService
// instantiations) — re-registering the same counter name on one shared registry would throw.
function fakeMetrics() {
  return { registry: new Registry() } as unknown as MetricsService;
}

function fakeCheckoutSession(event: { type: string; clientReferenceId?: string | null }) {
  return {
    type: event.type,
    data: {
      object: {
        id: 'cs_test_1',
        client_reference_id:
          event.clientReferenceId === undefined ? 'order-1' : event.clientReferenceId,
      },
    },
  } as never;
}

describe('PaymentService', () => {
  let prisma: {
    payment: {
      create: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    outboxMessage: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let stripe: { createCheckoutSession: jest.Mock; constructWebhookEvent: jest.Mock };
  let service: PaymentService;

  const items = [{ productId: 'p1', quantity: 2 }];

  beforeEach(() => {
    prisma = {
      payment: {
        create: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      outboxMessage: { create: jest.fn() },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    stripe = {
      createCheckoutSession: jest.fn().mockResolvedValue({
        sessionId: 'cs_test_1',
        url: 'https://checkout.stripe.com/cs_test_1',
      }),
      constructWebhookEvent: jest.fn(),
    };
    service = new PaymentService(prisma as never, stripe as never, fakeMetrics());
  });

  describe('handleInventoryReserved', () => {
    it('creates a Checkout Session and writes a PaymentCheckoutCreated outbox event', async () => {
      prisma.payment.create.mockResolvedValue(undefined);

      await service.handleInventoryReserved('event-1', 'c1', 'order-1', items);

      expect(prisma.payment.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          correlationId: 'c1',
          triggeringEventId: 'event-1',
          status: 'PENDING',
        },
      });
      expect(stripe.createCheckoutSession).toHaveBeenCalledWith('order-1', items);
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { orderId: 'order-1' },
        data: {
          checkoutSessionId: 'cs_test_1',
          checkoutUrl: 'https://checkout.stripe.com/cs_test_1',
        },
      });
      const outboxCalls = prisma.outboxMessage.create.mock.calls as [
        { data: { type: string; payload: { orderId: string; checkoutUrl: string } } },
      ][];
      expect(outboxCalls[0][0].data.type).toBe('PaymentCheckoutCreated');
      expect(outboxCalls[0][0].data.payload).toEqual({
        orderId: 'order-1',
        checkoutUrl: 'https://checkout.stripe.com/cs_test_1',
      });
    });

    it('is a no-op for a redelivered event once the order already has a terminal payment', async () => {
      prisma.payment.create.mockRejectedValue(p2002());
      prisma.payment.findUniqueOrThrow.mockResolvedValue({ status: 'CONFIRMED' });

      await service.handleInventoryReserved('event-2', 'c1', 'order-1', items);

      expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('is a no-op for a redelivered event once a Checkout Session already exists', async () => {
      prisma.payment.create.mockRejectedValue(p2002());
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        status: 'PENDING',
        checkoutSessionId: 'cs_test_1',
      });

      await service.handleInventoryReserved('event-2', 'c1', 'order-1', items);

      expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates the Checkout Session for an order stuck PENDING with none yet (crash recovery)', async () => {
      prisma.payment.create.mockRejectedValue(p2002());
      prisma.payment.findUniqueOrThrow.mockResolvedValue({
        status: 'PENDING',
        checkoutSessionId: null,
      });

      await service.handleInventoryReserved('event-2', 'c1', 'order-1', items);

      expect(stripe.createCheckoutSession).toHaveBeenCalledWith('order-1', items);
    });

    it('rethrows a database error unrelated to the idempotency key', async () => {
      prisma.payment.create.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.handleInventoryReserved('event-1', 'c1', 'order-1', items),
      ).rejects.toThrow('connection lost');
      expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
    });
  });

  describe('handleStripeEvent', () => {
    it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])(
      'confirms a PENDING payment on %s and writes a PaymentConfirmed outbox event',
      async (type) => {
        prisma.payment.findUnique.mockResolvedValue({
          orderId: 'order-1',
          status: 'PENDING',
          correlationId: 'c1',
        });

        await service.handleStripeEvent(fakeCheckoutSession({ type }));

        expect(prisma.payment.update).toHaveBeenCalledWith({
          where: { orderId: 'order-1' },
          data: { status: 'CONFIRMED', providerReference: 'cs_test_1' },
        });
        const outboxCalls = prisma.outboxMessage.create.mock.calls as [
          { data: { type: string; correlationId: string; payload: { orderId: string } } },
        ][];
        expect(outboxCalls[0][0].data.type).toBe('PaymentConfirmed');
        expect(outboxCalls[0][0].data.correlationId).toBe('c1');
      },
    );

    it.each(['checkout.session.expired', 'checkout.session.async_payment_failed'])(
      'fails a PENDING payment on %s and writes a PaymentFailed outbox event',
      async (type) => {
        prisma.payment.findUnique.mockResolvedValue({
          orderId: 'order-1',
          status: 'PENDING',
          correlationId: 'c1',
        });

        await service.handleStripeEvent(fakeCheckoutSession({ type }));

        expect(prisma.payment.update).toHaveBeenCalledWith({
          where: { orderId: 'order-1' },
          data: { status: 'FAILED', failureReason: expect.any(String) as unknown },
        });
        const outboxCalls = prisma.outboxMessage.create.mock.calls as [
          { data: { type: string } },
        ][];
        expect(outboxCalls[0][0].data.type).toBe('PaymentFailed');
      },
    );

    it('ignores an unrelated Stripe event type', async () => {
      await service.handleStripeEvent({ type: 'payment_intent.created' } as never);

      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('drops a checkout.session event with no client_reference_id', async () => {
      await service.handleStripeEvent(
        fakeCheckoutSession({ type: 'checkout.session.completed', clientReferenceId: null }),
      );

      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('drops a webhook for an order with no Payment row', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await service.handleStripeEvent(fakeCheckoutSession({ type: 'checkout.session.completed' }));

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('is a no-op for a redelivered webhook once the payment already has a terminal status', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        orderId: 'order-1',
        status: 'CONFIRMED',
        correlationId: 'c1',
      });

      await service.handleStripeEvent(fakeCheckoutSession({ type: 'checkout.session.completed' }));

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
