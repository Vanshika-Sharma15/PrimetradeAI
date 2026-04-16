const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDatabase, saveDatabase } = require('../config/database');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const ApiResponse = require('../utils/ApiResponse');
const { logAudit } = require('../utils/audit');

/** Helper: convert sql.js result to object array */
function rowsToObjects(result) {
  if (!result.length || !result[0].values.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    return obj;
  });
}

/** Sanitize user object – never return password hash */
function sanitizeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// ─── REGISTER ────────────────────────────────────────────────
async function register(req, res, next) {
  try {
    const { email, username, password, first_name, last_name } = req.body;
    const db = await getDatabase();

    // Check uniqueness
    const existing = db.exec(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );
    if (existing.length && existing[0].values.length) {
      return ApiResponse.conflict(res, 'Email or username already in use');
    }

    const id = uuidv4();
    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    db.run(
      `INSERT INTO users (id, email, username, password_hash, first_name, last_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, email, username, password_hash, first_name || null, last_name || null]
    );
    saveDatabase();

    const accessToken = generateAccessToken({ id, email, role: 'user' });
    const refreshToken = generateRefreshToken({ id });

    // Store refresh token hash
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [uuidv4(), id, tokenHash, expiresAt]
    );
    saveDatabase();

    await logAudit({
      userId: id, action: 'REGISTER', entityType: 'user', entityId: id,
      ipAddress: req.ip,
    });

    return ApiResponse.created(res, {
      user: { id, email, username, first_name, last_name, role: 'user' },
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
    }, 'Registration successful');
  } catch (err) {
    next(err);
  }
}

// ─── LOGIN ───────────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const db = await getDatabase();

    const result = db.exec('SELECT * FROM users WHERE email = ?', [email]);
    const users = rowsToObjects(result);

    if (!users.length) {
      return ApiResponse.unauthorized(res, 'Invalid email or password');
    }

    const user = users[0];

    if (!user.is_active) {
      return ApiResponse.forbidden(res, 'Account has been deactivated');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return ApiResponse.unauthorized(res, 'Invalid email or password');
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store refresh token
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [uuidv4(), user.id, tokenHash, expiresAt]
    );

    // Update last login
    db.run('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?', [user.id]);
    saveDatabase();

    await logAudit({
      userId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id,
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, {
      user: sanitizeUser(user),
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
    }, 'Login successful');
  } catch (err) {
    next(err);
  }
}

// ─── REFRESH TOKEN ───────────────────────────────────────────
async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body;
    const decoded = verifyRefreshToken(refresh_token);
    const db = await getDatabase();

    const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    const stored = db.exec(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > datetime(\'now\')',
      [tokenHash]
    );

    if (!stored.length || !stored[0].values.length) {
      return ApiResponse.unauthorized(res, 'Invalid or expired refresh token');
    }

    const userResult = db.exec('SELECT * FROM users WHERE id = ? AND is_active = 1', [decoded.id]);
    const users = rowsToObjects(userResult);
    if (!users.length) {
      return ApiResponse.unauthorized(res, 'User not found or deactivated');
    }

    // Revoke old token
    db.run('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [tokenHash]);

    // Issue new pair
    const user = users[0];
    const newAccess = generateAccessToken(user);
    const newRefresh = generateRefreshToken(user);
    const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    db.run(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [uuidv4(), user.id, newHash, expiresAt]
    );
    saveDatabase();

    return ApiResponse.success(res, {
      access_token: newAccess,
      refresh_token: newRefresh,
      token_type: 'Bearer',
    }, 'Token refreshed');
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return ApiResponse.unauthorized(res, 'Invalid or expired refresh token');
    }
    next(err);
  }
}

// ─── LOGOUT ──────────────────────────────────────────────────
async function logout(req, res, next) {
  try {
    const { refresh_token } = req.body;
    if (refresh_token) {
      const db = await getDatabase();
      const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
      db.run('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [tokenHash]);
      saveDatabase();
    }

    await logAudit({
      userId: req.user.id, action: 'LOGOUT', entityType: 'user', entityId: req.user.id,
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
}

// ─── GET PROFILE ─────────────────────────────────────────────
async function getProfile(req, res, next) {
  try {
    const db = await getDatabase();
    const result = db.exec('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const users = rowsToObjects(result);
    if (!users.length) return ApiResponse.notFound(res, 'User not found');
    return ApiResponse.success(res, sanitizeUser(users[0]));
  } catch (err) {
    next(err);
  }
}

// ─── UPDATE PROFILE ──────────────────────────────────────────
async function updateProfile(req, res, next) {
  try {
    const { first_name, last_name } = req.body;
    const db = await getDatabase();

    db.run(
      `UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name),
       updated_at = datetime('now') WHERE id = ?`,
      [first_name || null, last_name || null, req.user.id]
    );
    saveDatabase();

    const result = db.exec('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const users = rowsToObjects(result);

    return ApiResponse.success(res, sanitizeUser(users[0]), 'Profile updated');
  } catch (err) {
    next(err);
  }
}

// ─── CHANGE PASSWORD ─────────────────────────────────────────
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    const db = await getDatabase();

    const result = db.exec('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const users = rowsToObjects(result);
    if (!users.length) return ApiResponse.notFound(res, 'User not found');

    const isMatch = await bcrypt.compare(current_password, users[0].password_hash);
    if (!isMatch) return ApiResponse.badRequest(res, 'Current password is incorrect');

    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(new_password, salt);
    db.run('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?', [hash, req.user.id]);

    // Revoke all refresh tokens (force re-login)
    db.run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [req.user.id]);
    saveDatabase();

    await logAudit({
      userId: req.user.id, action: 'CHANGE_PASSWORD', entityType: 'user', entityId: req.user.id,
      ipAddress: req.ip,
    });

    return ApiResponse.success(res, null, 'Password changed – please log in again');
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login, refresh, logout, getProfile, updateProfile, changePassword };
