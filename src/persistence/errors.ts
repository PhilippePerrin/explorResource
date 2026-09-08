import type { ZodIssue } from 'zod';

export class PersistenceValidationError extends Error {
  public readonly issues?: ZodIssue[];

  public constructor(message: string, issues?: ZodIssue[]) {
    super(message);
    this.name = 'PersistenceValidationError';
    this.issues = issues;
  }
}

export class PersistenceWriteError extends Error {
  public override readonly cause?: unknown;

  public constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'PersistenceWriteError';
    this.cause = options?.cause;
  }
}

export class UnsupportedBackupFormatError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'UnsupportedBackupFormatError';
  }
}

export function formatZodIssues(issues: ZodIssue[], limit = 5): string {
  return issues
    .slice(0, limit)
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}
