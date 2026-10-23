import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DROPWIRE_INVENTORY_V1_PACKAGE_NAME } from '../generated/proto/dropwire/inventory/v1/inventory';
import { PrismaModule } from '../prisma/prisma.module';
import { INVENTORY_CLIENT } from './inventory-client.constant';
import { OrderEventsConsumer } from './order-events.consumer';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: INVENTORY_CLIENT,
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: DROPWIRE_INVENTORY_V1_PACKAGE_NAME,
            protoPath: join(
              process.cwd(),
              '../../contracts/proto/dropwire/inventory/v1/inventory.proto',
            ),
            url: config.get<string>('INVENTORY_GRPC_URL') ?? 'localhost:4002',
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderEventsConsumer],
})
export class OrdersModule {}
