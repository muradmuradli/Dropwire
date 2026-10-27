// Every service wraps a thrown HTTP error the same way (root CLAUDE.md's error-envelope
// convention: `{ error: { code, message, correlationId } }`), but `message` isn't always a
// plain string — Nest's own default exceptions (e.g. a bare NotFoundException) put a nested
// `{ message, error, statusCode }` object there instead of a string. This normalizes both
// shapes into one readable message rather than assuming either.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorEnvelope {
  error?: {
    message?: string | { message?: string };
    correlationId?: string;
  };
}

export async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  let message = `request failed with status ${response.status}`;
  let correlationId: string | undefined;
  try {
    const body = (await response.json()) as ErrorEnvelope;
    const envelopeMessage = body.error?.message;
    if (typeof envelopeMessage === 'string') {
      message = envelopeMessage;
    } else if (envelopeMessage && typeof envelopeMessage.message === 'string') {
      message = envelopeMessage.message;
    }
    correlationId = body.error?.correlationId;
  } catch {
    // Body wasn't JSON (or was already consumed) — fall back to the generic message above.
  }

  throw new ApiError(response.status, message, correlationId);
}
