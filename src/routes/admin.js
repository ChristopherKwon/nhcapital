// src/routes/admin.js
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth');
const {
  getDashboard, getUsers, createUser, updateUser,
  getDepartments, createDepartment,
  getTicketTypes, createTicketType,
} = require('../controllers/adminController');
const { getAllDeployments } = require('../controllers/deploymentController');
const prisma = require('../utils/prisma');

router.use(authenticate, authorize('ADMIN', 'MANAGER'));

router.get('/dashboard', getDashboard);
router.get('/users', authorize('ADMIN'), getUsers);
router.post('/users', authorize('ADMIN'), createUser);
router.patch('/users/:id', authorize('ADMIN'), updateUser);
router.get('/departments', getDepartments);
router.post('/departments', authorize('ADMIN'), createDepartment);
router.get('/ticket-types', getTicketTypes);
router.post('/ticket-types', authorize('ADMIN'), createTicketType);

// 운영 이관 현황
router.get('/deployments', getAllDeployments);

// 감사 로그
router.get('/audit-logs', async (req, res, next) => {
  try {
    const { action, entityType, userId, from, to, page = 1, limit = 50 } = req.query;
    const where = {};
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (entityType) where.entityType = entityType;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    const [logs, total] = await Promise.all([
      require('../utils/prisma').auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: Number(limit),
      }),
      require('../utils/prisma').auditLog.count({ where }),
    ]);
    res.json({ logs, total });
  } catch (err) { next(err); }
});

// 알림 목록
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      include: { ticket: { select: { ticketNumber: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id, userId: req.user.id },
      data: { isRead: true },
    });
    res.json({ message: '읽음 처리되었습니다.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
