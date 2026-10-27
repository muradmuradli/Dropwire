import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      // req.route is only populated once Nest's router has matched a handler, which has
      // happened by the time the response finishes — falls back to the raw path (e.g. for a
      // 404 that never matched a route) so that case still gets measured too.
      const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
      this.metrics.httpRequestDuration.observe(
        { method: req.method, route, status: String(res.statusCode) },
        durationSeconds,
      );
    });
    next();
  }
}
