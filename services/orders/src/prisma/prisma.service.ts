import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaClient } from '../../generated/prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async pingCheck(): Promise<HealthIndicatorResult> {
    try {
      await this.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch (error) {
      // Terminus only aggregates a check into its structured error response if the
      // indicator function resolves with a 'down' result — a thrown/rejected error
      // propagates straight past it into the app's generic exception handling instead.
      return {
        database: {
          status: 'down',
          message: error instanceof Error ? error.message : 'unknown error',
        },
      };
    }
  }
}
