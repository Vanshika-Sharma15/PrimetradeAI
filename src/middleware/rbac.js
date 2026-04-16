const ApiResponse = require('../utils/ApiResponse');

/**
 * Middleware factory: restrict route to specific roles.
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'user')
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.unauthorized(res, 'Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      return ApiResponse.forbidden(res, `Role '${req.user.role}' does not have access to this resource`);
    }
    next();
  };
}

/**
 * Middleware: ensure resource belongs to the requesting user OR user is admin.
 */
function ownerOrAdmin(ownerField = 'user_id') {
  return (req, res, next) => {
    if (!req.user) return ApiResponse.unauthorized(res);
    // Admin bypasses ownership check
    if (req.user.role === 'admin') return next();
    // Will be checked in controller after fetching resource
    req._ownerField = ownerField;
    next();
  };
}

module.exports = { authorize, ownerOrAdmin };
