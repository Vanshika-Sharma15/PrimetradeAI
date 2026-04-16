const { Router } = require('express');
const { getDatabase } = require('../config/database');
const ApiResponse = require('../utils/ApiResponse');

const router = Router();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200: { description: API is healthy }
 */
router.get('/health', async (req, res) => {
  try {
    const db = await getDatabase();
    db.exec('SELECT 1');
    return ApiResponse.success(res, {
      status: 'healthy',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return ApiResponse.error(res, 'Database connection failed', 503);
  }
});

module.exports = router;
