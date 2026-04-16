require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const routes = require('./routes');
const swaggerSpec = require('./docs/swagger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { migrate } = require('./config/migrate');
const { seed } = require('./config/seed');

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = process.env.API_VERSION || 'v1';

// ─── SECURITY MIDDLEWARE ─────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400,
}));

// ─── RATE LIMITING ───────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests – please try again later' },
});
app.use('/api/', limiter);

// Stricter limit on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts – try again in 15 minutes' },
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// ─── BODY PARSING ────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── LOGGING ─────────────────────────────────────────────────
app.use(morgan(process.env.LOG_LEVEL || 'dev'));

// ─── STATIC FILES (frontend) ────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── API DOCUMENTATION ──────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TaskFlow API Documentation',
}));

// Expose spec as JSON
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// ─── API ROUTES ──────────────────────────────────────────────
app.use(`/api/${API_VERSION}`, routes);

// ─── ROOT REDIRECT ───────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    name: 'TaskFlow API',
    version: '1.0.0',
    documentation: '/api-docs',
    health: `/api/${API_VERSION}/health`,
    endpoints: {
      auth: `/api/${API_VERSION}/auth`,
      tasks: `/api/${API_VERSION}/tasks`,
      admin: `/api/${API_VERSION}/admin`,
    },
  });
});

// ─── ERROR HANDLING ──────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── BOOT ────────────────────────────────────────────────────
async function boot() {
  console.log('\n  ╔═══════════════════════════════════════╗');
  console.log('  ║         TaskFlow API Server            ║');
  console.log('  ╚═══════════════════════════════════════╝\n');

  console.log('  ⏳ Running database migrations...');
  await migrate();

  console.log('  ⏳ Seeding initial data...');
  await seed();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🚀 Server running on http://localhost:${PORT}`);
    console.log(`  📚 API Docs:  http://localhost:${PORT}/api-docs`);
    console.log(`  🔧 API Base:  http://localhost:${PORT}/api/${API_VERSION}`);
    console.log(`  🏥 Health:    http://localhost:${PORT}/api/${API_VERSION}/health`);
    console.log(`  🌐 Frontend:  http://localhost:${PORT}\n`);
  });
}

boot().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
