// Sends standardized API response envelopes.

export function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    errors: [],
  });
}

export function errorEnvelope(message, details = undefined) {
  const error = { message };
  if (details) error.details = details;

  return {
    success: false,
    data: null,
    errors: [error],
  };
}
