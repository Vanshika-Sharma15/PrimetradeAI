/**
 * Standardized API response wrapper.
 * Ensures consistent JSON shape across all endpoints.
 */
class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static created(res, data = null, message = 'Resource created') {
    return ApiResponse.success(res, data, message, 201);
  }

  static noContent(res) {
    return res.status(204).send();
  }

  static error(res, message = 'Internal server error', statusCode = 500, errors = null) {
    const body = {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    };
    if (errors) body.errors = errors;
    return res.status(statusCode).json(body);
  }

  static badRequest(res, message = 'Bad request', errors = null) {
    return ApiResponse.error(res, message, 400, errors);
  }

  static unauthorized(res, message = 'Unauthorized') {
    return ApiResponse.error(res, message, 401);
  }

  static forbidden(res, message = 'Forbidden – insufficient permissions') {
    return ApiResponse.error(res, message, 403);
  }

  static notFound(res, message = 'Resource not found') {
    return ApiResponse.error(res, message, 404);
  }

  static conflict(res, message = 'Conflict') {
    return ApiResponse.error(res, message, 409);
  }

  static tooMany(res, message = 'Too many requests – slow down') {
    return ApiResponse.error(res, message, 429);
  }

  static paginated(res, { data, page, limit, total }) {
    return res.status(200).json({
      success: true,
      message: 'Success',
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = ApiResponse;
