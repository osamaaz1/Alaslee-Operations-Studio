export class AppError extends Error {
  constructor(message, statusCode = 500, details = undefined) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export function isAppError(error) {
  return error instanceof AppError;
}
