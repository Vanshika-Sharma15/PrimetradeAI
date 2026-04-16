const { getDatabase, saveDatabase } = require('../config/database');
const ApiResponse = require('../utils/ApiResponse');
const { logAudit } = require('../utils/audit');

function rowsToObjects(result) {
  if (!result.length || !result[0].values.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    delete obj.password_hash;
    return obj;
  });
}

// ─── LIST USERS (admin) ──────────────────────────────────────
async function listUsers(req, res, next) {
  try {
    const db = await getDatabase();
    const { page = 1, limit = 20, role, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    let where = [];
    let params = [];

    if (role) { where.push('role = ?'); params.push(role); }
    if (search) {
      where.push('(username LIKE ? OR email LIKE ? OR first_name LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = db.exec(`SELECT COUNT(*) FROM users ${whereClause}`, params);
    const total = countResult.length ? countResult[0].values[0][0] : 0;

    const result = db.exec(
      `SELECT * FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    return ApiResponse.paginated(res, {
      data: rowsToObjects(result),
      page: pageNum,
      limit: limitNum,
      total,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET USER BY ID (admin) ─────────────────────────────────
async function getUser(req, res, next) {
  try {
    const db = await getDatabase();
    const result = db.exec('SELECT * FROM users WHERE id = ?', [req.params.id]);
    const users = rowsToObjects(result);
    if (!users.length) return ApiResponse.notFound(res, 'User not found');
    return ApiResponse.success(res, users[0]);
  } catch (err) {
    next(err);
  }
}

// ─── UPDATE USER ROLE (admin) ────────────────────────────────
async function updateUserRole(req, res, next) {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return ApiResponse.badRequest(res, 'Role must be "user" or "admin"');
    }

    const db = await getDatabase();
    const existing = db.exec('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!existing.length || !existing[0].values.length) {
      return ApiResponse.notFound(res, 'User not found');
    }

    // Prevent self-demotion
    if (req.params.id === req.user.id && role !== 'admin') {
      return ApiResponse.badRequest(res, 'Cannot change your own admin role');
    }

    db.run('UPDATE users SET role = ?, updated_at = datetime(\'now\') WHERE id = ?', [role, req.params.id]);
    saveDatabase();

    await logAudit({
      userId: req.user.id, action: 'UPDATE_USER_ROLE', entityType: 'user',
      entityId: req.params.id, details: { role }, ipAddress: req.ip,
    });

    const result = db.exec('SELECT * FROM users WHERE id = ?', [req.params.id]);
    return ApiResponse.success(res, rowsToObjects(result)[0], 'User role updated');
  } catch (err) {
    next(err);
  }
}

// ─── DEACTIVATE USER (admin) ────────────────────────────────
async function toggleUserActive(req, res, next) {
  try {
    const db = await getDatabase();
    const existing = db.exec('SELECT id, is_active FROM users WHERE id = ?', [req.params.id]);
    if (!existing.length || !existing[0].values.length) {
      return ApiResponse.notFound(res, 'User not found');
    }

    if (req.params.id === req.user.id) {
      return ApiResponse.badRequest(res, 'Cannot deactivate your own account');
    }

    const currentActive = existing[0].values[0][1];
    const newActive = currentActive ? 0 : 1;
    db.run('UPDATE users SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?', [newActive, req.params.id]);
    saveDatabase();

    await logAudit({
      userId: req.user.id,
      action: newActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER',
      entityType: 'user', entityId: req.params.id, ipAddress: req.ip,
    });

    return ApiResponse.success(res, null, `User ${newActive ? 'activated' : 'deactivated'}`);
  } catch (err) {
    next(err);
  }
}

// ─── AUDIT LOGS (admin) ─────────────────────────────────────
async function getAuditLogs(req, res, next) {
  try {
    const db = await getDatabase();
    const { page = 1, limit = 50, action, entity_type } = req.query;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit) || 50, 200);
    const offset = (pageNum - 1) * limitNum;

    let where = [];
    let params = [];
    if (action) { where.push('a.action = ?'); params.push(action); }
    if (entity_type) { where.push('a.entity_type = ?'); params.push(entity_type); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = db.exec(`SELECT COUNT(*) FROM audit_logs a ${whereClause}`, params);
    const total = countResult.length ? countResult[0].values[0][0] : 0;

    const result = db.exec(
      `SELECT a.*, u.username FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const logs = rowsToObjects(result).map((l) => {
      if (l.details && typeof l.details === 'string') {
        try { l.details = JSON.parse(l.details); } catch {}
      }
      return l;
    });

    return ApiResponse.paginated(res, { data: logs, page: pageNum, limit: limitNum, total });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUser, updateUserRole, toggleUserActive, getAuditLogs };
