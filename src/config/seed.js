const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDatabase, saveDatabase } = require('./database');
const { migrate } = require('./migrate');

async function seed() {
  await migrate();
  const db = await getDatabase();

  // Check if already seeded
  const existing = db.exec("SELECT COUNT(*) as c FROM users");
  if (existing.length && existing[0].values[0][0] > 0) {
    console.log('  ✓ Database already seeded');
    return;
  }

  const adminId = uuidv4();
  const userId = uuidv4();
  const salt = await bcrypt.genSalt(12);

  // Create admin user
  const adminHash = await bcrypt.hash('Admin@123', salt);
  db.run(
    `INSERT INTO users (id, email, username, password_hash, first_name, last_name, role)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [adminId, 'admin@taskflow.io', 'admin', adminHash, 'System', 'Admin', 'admin']
  );

  // Create regular user
  const userHash = await bcrypt.hash('User@123', salt);
  db.run(
    `INSERT INTO users (id, email, username, password_hash, first_name, last_name, role)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, 'user@taskflow.io', 'johndoe', userHash, 'John', 'Doe', 'user']
  );

  // Seed tasks
  const tasks = [
    { title: 'Set up CI/CD pipeline', desc: 'Configure GitHub Actions for automated testing and deployment', status: 'in_progress', priority: 'high', tags: '["devops","ci"]' },
    { title: 'Design database schema', desc: 'Create ERD and define all entity relationships', status: 'done', priority: 'critical', tags: '["database","design"]' },
    { title: 'Write API documentation', desc: 'Document all endpoints using Swagger/OpenAPI spec', status: 'todo', priority: 'medium', tags: '["docs"]' },
    { title: 'Implement rate limiting', desc: 'Add express-rate-limit to prevent API abuse', status: 'review', priority: 'high', tags: '["security"]' },
    { title: 'Add unit tests', desc: 'Write tests for auth and task controllers', status: 'todo', priority: 'medium', tags: '["testing"]' },
    { title: 'Set up monitoring', desc: 'Configure health checks and application metrics', status: 'todo', priority: 'low', tags: '["devops","monitoring"]' },
  ];

  for (const t of tasks) {
    db.run(
      `INSERT INTO tasks (id, title, description, status, priority, tags, user_id, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), t.title, t.desc, t.status, t.priority, t.tags, userId, userId]
    );
  }

  saveDatabase();
  console.log('  ✓ Seeded admin + user + 6 sample tasks');
  console.log('    Admin: admin@taskflow.io / Admin@123');
  console.log('    User:  user@taskflow.io  / User@123');
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed };
