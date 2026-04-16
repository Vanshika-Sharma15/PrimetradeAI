const { Router } = require('express');
const authRoutes = require('./auth.routes');
const taskRoutes = require('./task.routes');
const adminRoutes = require('./admin.routes');
const healthRoutes = require('./health.routes');

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/tasks', taskRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
