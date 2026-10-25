import { Logger } from '@nestjs/common';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new NotificationService();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs a mock order-confirmed email', () => {
    service.sendOrderConfirmedEmail('event-1', 'order-1', 'customer-1');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('order-1'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('customer-1'));
  });

  it('logs a mock order-cancelled email with the reason', () => {
    service.sendOrderCancelledEmail('event-1', 'order-1', 'customer-1', 'card declined');

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('card declined'));
  });

  it('skips a duplicate event id instead of sending twice', () => {
    service.sendOrderConfirmedEmail('event-1', 'order-1', 'customer-1');
    logSpy.mockClear();

    service.sendOrderConfirmedEmail('event-1', 'order-1', 'customer-1');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('skipping duplicate'));
  });

  it('treats OrderConfirmed and OrderCancelled event ids as separate namespaces no differently than any other id', () => {
    service.sendOrderConfirmedEmail('event-1', 'order-1', 'customer-1');
    logSpy.mockClear();

    service.sendOrderCancelledEmail('event-2', 'order-1', 'customer-1', 'reason');

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('skipping duplicate'));
  });

  it('evicts the oldest event id once the cache exceeds its bound', () => {
    for (let i = 0; i < 1001; i++) {
      service.sendOrderConfirmedEmail(`event-${i}`, 'order-1', 'customer-1');
    }
    logSpy.mockClear();

    // event-0 was the first one in and should have been evicted by now, so it's treated as new.
    service.sendOrderConfirmedEmail('event-0', 'order-1', 'customer-1');

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('skipping duplicate'));
  });
});
