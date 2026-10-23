import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentEventsConsumer } from './payment-events.consumer';
import { PaymentService } from './payment.service';

@Module({
  imports: [PrismaModule],
  providers: [PaymentService, PaymentEventsConsumer],
})
export class PaymentModule {}
