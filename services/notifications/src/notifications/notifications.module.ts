import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { OrderEventsConsumer } from './order-events.consumer';

@Module({
  providers: [NotificationService, OrderEventsConsumer],
})
export class NotificationsModule {}
