import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CatalogProxyController } from './catalog-proxy/catalog-proxy.controller';
import { HealthModule } from './health/health.module';
import { MeController } from './me/me.controller';
import { HttpMetricsMiddleware } from './metrics/http-metrics.middleware';
import { MetricsModule } from './metrics/metrics.module';
import { AdminOrdersProxyController } from './orders-proxy/admin-orders-proxy.controller';
import { OrdersProxyController } from './orders-proxy/orders-proxy.controller';
import { ProxyService } from './proxy/proxy.service';

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
    MetricsModule,
    AuthModule,
  ],
  controllers: [
    AppController,
    MeController,
    OrdersProxyController,
    AdminOrdersProxyController,
    CatalogProxyController,
  ],
  providers: [AppService, ProxyService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
