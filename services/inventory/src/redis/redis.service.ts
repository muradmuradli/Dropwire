import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthIndicatorResult } from '@nestjs/terminus';
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

  async pingCheck(): Promise<HealthIndicatorResult> {
    // ioredis's own retry/backoff on a dropped connection can take tens of seconds before
    // a queued command like ping() actually rejects — far too slow for a health check,
    // which needs to fail fast regardless of how the client itself handles reconnection.
    const timeout = new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('redis ping timed out')), 2000),
    );
    try {
      await Promise.race([this.ping(), timeout]);
      return { redis: { status: 'up' } };
    } catch (error) {
      // Terminus only aggregates a check into its structured error response if the
      // indicator function resolves with a 'down' result — a thrown/rejected error
      // propagates straight past it into the app's generic exception handling instead.
      return {
        redis: {
          status: 'down',
          message: error instanceof Error ? error.message : 'unknown error',
        },
      };
    }
  }
}
