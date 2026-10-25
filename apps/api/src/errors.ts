import type { ErrorCode } from '@catalog/contracts';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
  ) {
    super(code);
  }
}
