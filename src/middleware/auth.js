const { verifyAccessToken } = require('../utils/jwt');
const ApiResponse = require('../utils/ApiResponse');
const { getDatabase } = require('../config/database');

/**
 * Middleware: Verify JWT access token from Authorization header.
 * Attaches decoded user to req.user on success.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return ApiResponse.unauthorized(res, 'Missing or malformed Authorization header');
    }

    const token = header.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Verify user still exists and is active
    const db = await getDatabase();
    const result = db.exec('SELECT id, email, username, role, is_active FROM users WHERE id = ?', [decoded.id]);

    if (!result.length || !result[0].values.length) {
      return ApiResponse.unauthorized(res, 'User no longer exists');
    }

    const row = result[0].values[0];
    const cols = result[0].columns;
    const user = {};
    cols.forEach((c, i) => (user[c] = row[i]));

    if (!user.is_active) {
      return ApiResponse.forbidden(res, 'Account has been deactivated');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, 'Token expired – please refresh or log in again');
    }
    if (err.name === 'JsonWebTokenError') {
      return ApiResponse.unauthorized(res, 'Invalid token');
    }
    return ApiResponse.error(res, 'Authentication failed');
  }
}

/**
 * Optional auth: attaches user if token present, continues otherwise.
 */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();

  try {
    const token = header.split(' ')[1];
    const decoded = verifyAccessToken(token);
    const db = await getDatabase();
    const result = db.exec('SELECT id, email, username, role, is_active FROM users WHERE id = ?', [decoded.id]);
    if (result.length && result[0].values.length) {
      const row = result[0].values[0];
      const cols = result[0].columns;
      const user = {};
      cols.forEach((c, i) => (user[c] = row[i]));
      if (user.is_active) req.user = user;
    }
  } catch (_) {
    // Silently continue without auth
  }
  next();
}

module.exports = { authenticate, optionalAuth };
