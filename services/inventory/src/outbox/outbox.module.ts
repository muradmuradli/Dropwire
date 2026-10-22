import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  imports: [PrismaModule],
  providers: [OutboxRelayService],
})
export class OutboxModule {}
