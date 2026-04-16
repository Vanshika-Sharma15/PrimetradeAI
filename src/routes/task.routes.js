const { Router } = require('express');
const ctrl = require('../controllers/task.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createTaskValidation, updateTaskValidation, taskIdValidation, listTasksValidation,
} = require('../validators/task.validator');

const router = Router();

// All task routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/v1/tasks:
 *   get:
 *     summary: List tasks with filtering, search & pagination
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [todo, in_progress, review, done] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [created_at, updated_at, due_date, priority, title], default: created_at }
 *       - in: query
 *         name: order
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search title and description
 *     responses:
 *       200: { description: Paginated task list }
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string, maxLength: 200, example: "Implement OAuth2" }
 *               description: { type: string, example: "Add Google and GitHub OAuth providers" }
 *               status: { type: string, enum: [todo, in_progress, review, done], default: todo }
 *               priority: { type: string, enum: [low, medium, high, critical], default: medium }
 *               due_date: { type: string, format: date-time }
 *               tags: { type: array, items: { type: string }, example: ["auth", "backend"] }
 *               assigned_to: { type: string, format: uuid }
 *     responses:
 *       201: { description: Task created }
 *       400: { description: Validation error }
 */
router.get('/', listTasksValidation, validate, ctrl.listTasks);
router.post('/', createTaskValidation, validate, ctrl.createTask);

/**
 * @swagger
 * /api/v1/tasks/stats:
 *   get:
 *     summary: Get task statistics
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Task counts by status and priority }
 */
router.get('/stats', ctrl.getTaskStats);

/**
 * @swagger
 * /api/v1/tasks/{id}:
 *   get:
 *     summary: Get task by ID
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Task details }
 *       404: { description: Not found }
 *   put:
 *     summary: Update a task
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               status: { type: string, enum: [todo, in_progress, review, done] }
 *               priority: { type: string, enum: [low, medium, high, critical] }
 *               due_date: { type: string, format: date-time }
 *               tags: { type: array, items: { type: string } }
 *               assigned_to: { type: string, format: uuid }
 *     responses:
 *       200: { description: Task updated }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 *   delete:
 *     summary: Delete a task
 *     tags: [Tasks]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Task deleted }
 *       403: { description: Forbidden }
 *       404: { description: Not found }
 */
router.get('/:id', taskIdValidation, validate, ctrl.getTask);
router.put('/:id', updateTaskValidation, validate, ctrl.updateTask);
router.delete('/:id', taskIdValidation, validate, ctrl.deleteTask);

module.exports = router;
