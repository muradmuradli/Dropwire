import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

// Shared by every proxy controller (orders, catalog, ...): forwards a request to an
// upstream service and passes its response back byte-for-byte via @Res(), rather than
// re-wrapping it through gateway's own AllExceptionsFilter (which would double-nest the
// upstream's own error envelope). Forwards the Authorization header unchanged so the
// upstream can verify the token again independently (zero trust, notes/LEARNING.md §5) —
// harmless to forward even to a service like catalog that doesn't check it at all.
@Injectable()
export class ProxyService {
  async forward(
    baseUrl: string,
    serviceName: string,
    method: string,
    path: string,
    request: Request,
    response: Response,
    body?: unknown,
  ): Promise<void> {
    const correlationId =
      (request as Request & { id?: string }).id ??
      (request.headers['x-correlation-id'] as string | undefined);

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (request.headers.authorization) {
      headers.authorization = request.headers.authorization;
    }
    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }

    let upstream;
    try {
      upstream = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      response.status(503).json({
        error: { code: 503, message: `${serviceName} service is unreachable`, correlationId },
      });
      return;
    }

    const payload = await upstream.text();
    response.status(upstream.status);
    response.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
    response.send(payload);
  }
}
