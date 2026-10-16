import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MeController } from './me/me.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId: (req) => req.headers['x-correlation-id'] ?? randomUUID(),
        customProps: (req) => ({ correlationId: (req as { id?: string }).id }),
      },
    }),
    HealthModule,
    AuthModule,
  ],
  controllers: [AppController, MeController],
  providers: [AppService],
})
export class AppModule {}
