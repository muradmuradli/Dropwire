import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // rawBody: true populates request.rawBody alongside the normal parsed body on every request —
  // the Stripe webhook route needs the exact raw bytes to verify its signature (see
  // StripeWebhookController), and this is the one option that gets that without disabling or
  // reordering Nest's default body parsing for every other route.
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3004;
  await app.listen(port);
}
void bootstrap();
