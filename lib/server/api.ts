import { ZodError } from 'zod';
import { HttpError } from './repository';

export function apiJson(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) {
    return apiJson({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return apiJson(
      { error: error.issues[0]?.message ?? 'The request is invalid.', code: 'INVALID_REQUEST' },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  return apiJson({ error: message, code: 'SERVER_ERROR' }, { status: 500 });
}
