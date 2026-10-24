/** Why a handler refused. Entry layers map the code to a status (Express: express/app.ts). */
export type ErrorCode = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'PARSER_FAILED';

export class AppError extends Error {
  override name = 'AppError';

  /** `message` is shown to the user; `cause` (the underlying error) is only logged on the server. */
  constructor(
    readonly code: ErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}
