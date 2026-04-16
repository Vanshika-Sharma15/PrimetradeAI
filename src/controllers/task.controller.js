const { v4: uuidv4 } = require('uuid');
const { getDatabase, saveDatabase } = require('../config/database');
const ApiResponse = require('../utils/ApiResponse');
const { logAudit } = require('../utils/audit');

function rowsToObjects(result) {
  if (!result.length || !result[0].values.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row) => {
    const obj = {};
    cols.forEach((c, i) => (obj[c] = row[i]));
    // Parse JSON fields
    if (obj.tags && typeof obj.tags === 'string') {
      try { obj.tags = JSON.parse(obj.tags); } catch { obj.tags = []; }
    }
    return obj;
  });
}

// ─── LIST TASKS ──────────────────────────────────────────────
async function listTasks(req, res, next) {
  try {
    const db = await getDatabase();
    const {
      page = 1, limit = 20, status, priority, sort = 'created_at',
      order = 'desc', search, assigned_to,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);
    const offset = (pageNum - 1) * limitNum;

    let where = [];
    let params = [];

    // Regular users see only their own tasks; admins see all
    if (req.user.role !== 'admin') {
      where.push('(t.user_id = ? OR t.assigned_to = ?)');
      params.push(req.user.id, req.user.id);
    }

    if (status) { where.push('t.status = ?'); params.push(status); }
    if (priority) { where.push('t.priority = ?'); params.push(priority); }
    if (assigned_to) { where.push('t.assigned_to = ?'); params.push(assigned_to); }
    if (search) {
      where.push('(t.title LIKE ? OR t.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const allowedSorts = ['created_at', 'updated_at', 'due_date', 'priority', 'title'];
    const sortField = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    // Count
    const countResult = db.exec(`SELECT COUNT(*) as total FROM tasks t ${whereClause}`, params);
    const total = countResult.length ? countResult[0].values[0][0] : 0;

    // Fetch with creator info
    const dataResult = db.exec(
      `SELECT t.*, u.username as creator_username, u.email as creator_email,
              a.username as assignee_username
       FROM tasks t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       ${whereClause}
       ORDER BY t.${sortField} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const tasks = rowsToObjects(dataResult);

    return ApiResponse.paginated(res, {
      data: tasks,
      page: pageNum,
      limit: limitNum,
      total,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET SINGLE TASK ─────────────────────────────────────────
async function getTask(req, res, next) {
  try {
    const db = await getDatabase();
    const result = db.exec(
      `SELECT t.*, u.username as creator_username, a.username as assignee_username
       FROM tasks t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       WHERE t.id = ?`,
      [req.params.id]
    );
    const tasks = rowsToObjects(result);
    if (!tasks.length) return ApiResponse.notFound(res, 'Task not found');

    const task = tasks[0];
    // Ownership check for regular users
    if (req.user.role !== 'admin' && task.user_id !== req.user.id && task.assigned_to !== req.user.id) {
      return ApiResponse.forbidden(res, 'You do not have access to this task');
    }

    return ApiResponse.success(res, task);
  } catch (err) {
    next(err);
  }
}

// ─── CREATE TASK ─────────────────────────────────────────────
async function createTask(req, res, next) {
  try {
    const db = await getDatabase();
    const { title, description, status, priority, due_date, tags, assigned_to } = req.body;

    // Validate assigned_to exists if provided
    if (assigned_to) {
      const assignee = db.exec('SELECT id FROM users WHERE id = ? AND is_active = 1', [assigned_to]);
      if (!assignee.length || !assignee[0].values.length) {
        return ApiResponse.badRequest(res, 'Assigned user not found or inactive');
      }
    }

    const id = uuidv4();
    db.run(
      `INSERT INTO tasks (id, title, description, status, priority, due_date, tags, user_id, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        description || null,
        status || 'todo',
        priority || 'medium',
        due_date || null,
        tags ? JSON.stringify(tags) : '[]',
        req.user.id,
        assigned_to || null,
      ]
    );
    saveDatabase();

    // Fetch created task
    const result = db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
    const task = rowsToObjects(result)[0];

    await logAudit({
      userId: req.user.id, action: 'CREATE_TASK', entityType: 'task', entityId: id,
      details: { title }, ipAddress: req.ip,
    });

    return ApiResponse.created(res, task, 'Task created');
  } catch (err) {
    next(err);
  }
}

// ─── UPDATE TASK ─────────────────────────────────────────────
async function updateTask(req, res, next) {
  try {
    const db = await getDatabase();
    const { id } = req.params;

    // Check existence
    const existing = db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
    const tasks = rowsToObjects(existing);
    if (!tasks.length) return ApiResponse.notFound(res, 'Task not found');

    const task = tasks[0];
    if (req.user.role !== 'admin' && task.user_id !== req.user.id) {
      return ApiResponse.forbidden(res, 'You can only update your own tasks');
    }

    const { title, description, status, priority, due_date, tags, assigned_to } = req.body;

    if (assigned_to) {
      const assignee = db.exec('SELECT id FROM users WHERE id = ? AND is_active = 1', [assigned_to]);
      if (!assignee.length || !assignee[0].values.length) {
        return ApiResponse.badRequest(res, 'Assigned user not found or inactive');
      }
    }

    db.run(
      `UPDATE tasks SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority = COALESCE(?, priority),
        due_date = COALESCE(?, due_date),
        tags = COALESCE(?, tags),
        assigned_to = COALESCE(?, assigned_to),
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        title || null,
        description !== undefined ? description : null,
        status || null,
        priority || null,
        due_date !== undefined ? due_date : null,
        tags ? JSON.stringify(tags) : null,
        assigned_to !== undefined ? assigned_to : null,
        id,
      ]
    );
    saveDatabase();

    const result = db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
    const updated = rowsToObjects(result)[0];

    await logAudit({
      userId: req.user.id, action: 'UPDATE_TASK', entityType: 'task', entityId: id,
      details: req.body, ipAddress: req.ip,
    });

    return ApiResponse.success(res, updated, 'Task updated');
  } catch (err) {
    next(err);
  }
}

// ─── DELETE TASK ─────────────────────────────────────────────
async function deleteTask(req, res, next) {
  try {
    const db = await getDatabase();
    const { id } = req.params;

    const existing = db.exec('SELECT * FROM tasks WHERE id = ?', [id]);
    const tasks = rowsToObjects(existing);
    if (!tasks.length) return ApiResponse.notFound(res, 'Task not found');

    const task = tasks[0];
    if (req.user.role !== 'admin' && task.user_id !== req.user.id) {
      return ApiResponse.forbidden(res, 'You can only delete your own tasks');
    }

    db.run('DELETE FROM tasks WHERE id = ?', [id]);
    saveDatabase();

    await logAudit({
      userId: req.user.id, action: 'DELETE_TASK', entityType: 'task', entityId: id,
      details: { title: task.title }, ipAddress: req.ip,
    });

    return ApiResponse.success(res, null, 'Task deleted');
  } catch (err) {
    next(err);
  }
}

// ─── TASK STATS (admin or own) ───────────────────────────────
async function getTaskStats(req, res, next) {
  try {
    const db = await getDatabase();
    let userFilter = '';
    let params = [];

    if (req.user.role !== 'admin') {
      userFilter = 'WHERE user_id = ? OR assigned_to = ?';
      params = [req.user.id, req.user.id];
    }

    const statusResult = db.exec(
      `SELECT status, COUNT(*) as count FROM tasks ${userFilter} GROUP BY status`, params
    );
    const priorityResult = db.exec(
      `SELECT priority, COUNT(*) as count FROM tasks ${userFilter} GROUP BY priority`, params
    );
    const totalResult = db.exec(`SELECT COUNT(*) FROM tasks ${userFilter}`, params);

    const byStatus = {};
    if (statusResult.length) statusResult[0].values.forEach(([s, c]) => (byStatus[s] = c));
    const byPriority = {};
    if (priorityResult.length) priorityResult[0].values.forEach(([p, c]) => (byPriority[p] = c));
    const total = totalResult.length ? totalResult[0].values[0][0] : 0;

    return ApiResponse.success(res, { total, by_status: byStatus, by_priority: byPriority });
  } catch (err) {
    next(err);
  }
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, getTaskStats };
