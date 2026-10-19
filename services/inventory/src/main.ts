import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { DROPWIRE_INVENTORY_V1_PACKAGE_NAME } from './generated/proto/dropwire/inventory/v1/inventory';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3002;
  const grpcPort = config.get<number>('GRPC_PORT') ?? 4002;

  // Not inheriting the HTTP app's config (filters/pipes/guards) on purpose — gRPC errors
  // go through Nest's own RpcException handling, not the HTTP-shaped AllExceptionsFilter.
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: DROPWIRE_INVENTORY_V1_PACKAGE_NAME,
      protoPath: join(process.cwd(), '../../contracts/proto/dropwire/inventory/v1/inventory.proto'),
      url: `0.0.0.0:${grpcPort}`,
    },
  });

  await app.startAllMicroservices();
  await app.listen(port);
}
void bootstrap();
