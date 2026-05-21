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

// ── 마스터 데이터 CRUD API (ADMIN 전용) ──
const modelMap = {
  'departments': 'department',
  'ticket-types': 'ticketType',
  'workflow-stages': 'workflowStage',
  'tickets': 'ticket',
  'users': 'user',
  'test-cases': 'testCase',
  'defects': 'defect'
};

const getIncludesForModel = (modelName) => {
  if (modelName === 'user') return { department: true };
  if (modelName === 'workflowStage') return { ticketType: true, requiredDepartment: true, handlerDept: true };
  if (modelName === 'ticket') return { ticketType: true, requester: true, assignee: true, currentStage: true };
  if (modelName === 'testCase') return { ticket: true, createdBy: true };
  if (modelName === 'defect') return { ticket: true, reporter: true, assignee: true };
  return undefined;
};

const sanitizeBody = async (modelName, body) => {
  const data = { ...body };
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  delete data.ticketType;
  delete data.department;
  delete data.requester;
  delete data.assignee;
  delete data.currentStage;
  delete data.createdBy;
  delete data.reporter;

  if (modelName === 'user' && data.password) {
    const bcrypt = require('bcryptjs');
    data.passwordHash = await bcrypt.hash(data.password, 12);
    delete data.password;
  }

  // Type conversions
  if (data.stageOrder !== undefined) data.stageOrder = Number(data.stageOrder);
  if (data.slaTargetHours !== undefined) data.slaTargetHours = data.slaTargetHours ? Number(data.slaTargetHours) : null;
  if (data.isActive !== undefined) data.isActive = String(data.isActive) === 'true';
  if (data.isRequesterStage !== undefined) data.isRequesterStage = String(data.isRequesterStage) === 'true';
  if (data.dbChangeRequired !== undefined) data.dbChangeRequired = data.dbChangeRequired !== null ? String(data.dbChangeRequired) === 'true' : null;
  if (data.isCustomerFacing !== undefined) data.isCustomerFacing = data.isCustomerFacing !== null ? String(data.isCustomerFacing) === 'true' : null;

  return data;
};

// 1. 목록 조회
router.get('/crud/:model', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { model } = req.params;
    const modelName = modelMap[model];
    if (!modelName) return res.status(400).json({ error: '유효하지 않은 모델명입니다.' });

    const include = getIncludesForModel(modelName);
    let orderBy = { createdAt: 'desc' };
    if (modelName === 'workflowStage') {
      orderBy = { stageOrder: 'asc' };
    }

    const items = await prisma[modelName].findMany({
      include,
      orderBy,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// 2. 항목 생성
router.post('/crud/:model', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { model } = req.params;
    const modelName = modelMap[model];
    if (!modelName) return res.status(400).json({ error: '유효하지 않은 모델명입니다.' });

    const data = await sanitizeBody(modelName, req.body);
    const item = await prisma[modelName].create({
      data,
      include: getIncludesForModel(modelName),
    });

    // 감사 로그 기록
    const audit = require('../services/auditService');
    audit.log({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: `ADMIN_CREATE_${modelName.toUpperCase()}`,
      entityType: modelName,
      entityId: item.id,
      entityLabel: item.name || item.title || item.ticketNumber || item.employeeId || item.id,
      newValues: data,
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// 3. 항목 수정
router.put('/crud/:model/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { model, id } = req.params;
    const modelName = modelMap[model];
    if (!modelName) return res.status(400).json({ error: '유효하지 않은 모델명입니다.' });

    const original = await prisma[modelName].findUnique({ where: { id } });
    if (!original) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });

    const data = await sanitizeBody(modelName, req.body);
    const item = await prisma[modelName].update({
      where: { id },
      data,
      include: getIncludesForModel(modelName),
    });

    // 감사 로그 기록
    const audit = require('../services/auditService');
    audit.log({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: `ADMIN_UPDATE_${modelName.toUpperCase()}`,
      entityType: modelName,
      entityId: id,
      entityLabel: item.name || item.title || item.ticketNumber || item.employeeId || id,
      oldValues: original,
      newValues: data,
    });

    res.json(item);
  } catch (err) {
    next(err);
  }
});

// 4. 항목 삭제
router.delete('/crud/:model/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const { model, id } = req.params;
    const modelName = modelMap[model];
    if (!modelName) return res.status(400).json({ error: '유효하지 않은 모델명입니다.' });

    const original = await prisma[modelName].findUnique({ where: { id } });
    if (!original) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });

    await prisma[modelName].delete({ where: { id } });

    // 감사 로그 기록
    const audit = require('../services/auditService');
    audit.log({
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      action: `ADMIN_DELETE_${modelName.toUpperCase()}`,
      entityType: modelName,
      entityId: id,
      entityLabel: original.name || original.title || original.ticketNumber || original.employeeId || id,
      oldValues: original,
    });

    res.json({ message: '삭제되었습니다.' });
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(409).json({ error: '해당 데이터를 참조하는 다른 데이터가 존재하여 삭제할 수 없습니다. (외래키 제약조건)' });
    }
    next(err);
  }
});

module.exports = router;
