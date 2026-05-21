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

// 도메인-IT BA 매핑 관리 (ADMIN 전용)
router.get('/domain-itba-mappings', authorize('ADMIN'), async (req, res, next) => {
  try {
    const mappings = await prisma.domainItbaMapping.findMany({
      include: { itba: { select: { id: true, name: true, role: true, department: { select: { name: true } } } } },
      orderBy: { domain: 'asc' },
    });
    res.json(mappings);
  } catch (err) { next(err); }
});

router.post('/domain-itba-mappings', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { domain, itbaId } = req.body;
    if (!domain || !itbaId) return res.status(400).json({ error: '도메인과 IT BA는 필수입니다.' });
    const mapping = await prisma.domainItbaMapping.upsert({
      where: { domain },
      update: { itbaId },
      create: { domain, itbaId },
      include: { itba: { select: { id: true, name: true, role: true, department: { select: { name: true } } } } },
    });
    res.json(mapping);
  } catch (err) { next(err); }
});

router.delete('/domain-itba-mappings/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    await prisma.domainItbaMapping.delete({ where: { id: req.params.id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
});

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
