import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ reply: null, sessionId: null, error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      reply: null,
      sessionId: null,
      error: 'Validation failed',
      details: err.errors,
    });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ reply: null, sessionId: null, error: 'Internal server error' });
}
