const { v4: uuidv4 } = require('uuid');
const { getDatabase, saveDatabase } = require('../config/database');

async function logAudit({ userId, action, entityType, entityId, details, ipAddress }) {
  try {
    const db = await getDatabase();
    db.run(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), userId || null, action, entityType, entityId || null, details ? JSON.stringify(details) : null, ipAddress || null]
    );
    saveDatabase();
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { logAudit };
