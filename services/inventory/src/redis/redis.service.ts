import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Result } from 'ioredis';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    reserveStock(orderId: string, itemsJson: string): Result<string, Context>;
    releaseStock(orderId: string): Result<string, Context>;
  }
}

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379', { lazyConnect: true });

    this.defineCommand('reserveStock', {
      numberOfKeys: 0,
      lua: readFileSync(join(__dirname, 'scripts/reserve.lua'), 'utf8'),
    });
    this.defineCommand('releaseStock', {
      numberOfKeys: 0,
      lua: readFileSync(join(__dirname, 'scripts/release.lua'), 'utf8'),
    });
  }

  async onModuleInit() {
    await this.connect();
  }

  onModuleDestroy() {
    this.disconnect();
  }
}
