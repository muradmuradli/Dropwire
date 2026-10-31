import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeModule } from '../stripe/stripe.module';
import { PaymentEventsConsumer } from './payment-events.consumer';
import { PaymentService } from './payment.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [PrismaModule, StripeModule],
  controllers: [StripeWebhookController],
  providers: [PaymentService, PaymentEventsConsumer],
})
export class PaymentModule {}
