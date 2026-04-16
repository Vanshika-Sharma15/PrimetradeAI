const ApiResponse = require('../utils/ApiResponse');

/**
 * Global error handler.
 * Catches all unhandled errors and returns standardized response.
 */
function errorHandler(err, req, res, _next) {
  // Log full error in development
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  // Operational / known errors
  if (err.isOperational) {
    const response = {
      success: false,
      message: err.message,
      timestamp: new Date().toISOString(),
    };
    if (err.errors) response.errors = err.errors;
    return res.status(err.statusCode).json(response);
  }

  // JWT specific errors
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.unauthorized(res, 'Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    return ApiResponse.unauthorized(res, 'Token expired');
  }

  // Validation errors from express-validator
  if (err.type === 'entity.parse.failed') {
    return ApiResponse.badRequest(res, 'Malformed JSON in request body');
  }

  // Fallback: do not leak internal details in production
  return ApiResponse.error(
    res,
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    500
  );
}

/**
 * 404 handler for unmatched routes.
 */
function notFoundHandler(req, res) {
  ApiResponse.notFound(res, `Route ${req.method} ${req.originalUrl} not found`);
}

module.exports = { errorHandler, notFoundHandler };
