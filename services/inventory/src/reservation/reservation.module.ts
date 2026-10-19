import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ReservationController } from './reservation.controller';
import { ReservationService } from './reservation.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [ReservationController],
  providers: [ReservationService],
})
export class ReservationModule {}
