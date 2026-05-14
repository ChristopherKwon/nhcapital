// src/routes/tickets.js
const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const { getTickets, getTicketById, createTicket, processStage, addComment } = require('../controllers/ticketController');
const { requestConsensus, processConsensus, getMyConsensusRequests } = require('../controllers/consensusController');
const { getRequirements, createRequirement, updateRequirement, updateRequirementStatus } = require('../controllers/requirementController');
const { getDeployment, createDeployment, toggleChecklistItem, setReady, recordResult } = require('../controllers/deploymentController');
const multer = require('multer');
const path = require('path');
const prisma = require('../utils/prisma');

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_PATH || './uploads',
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 10485760 },
});

router.use(authenticate);

router.get('/', getTickets);
router.post('/', createTicket);
router.get('/my-consensus', getMyConsensusRequests);

// 내가 처리해야 할 티켓 목록
router.get('/actionable', async (req, res, next) => {
  try {
    const user = req.user;
    const allActive = await prisma.ticket.findMany({
      where: { status: 'IN_PROGRESS' },
      include: {
        ticketType: { select: { name: true } },
        requester: { select: { id: true, name: true, department: true } },
        assignee: { select: { id: true, name: true } },
        currentStage: true,
        developers: { select: { userId: true, completedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const actionable = allActive.filter(t => {
      const stage = t.currentStage;
      if (!stage) return false;

      // 요청자 단계: 본인이 요청자인 경우
      if (stage.isRequesterStage) return t.requesterId === user.id;

      // 역할 불일치
      if (stage.requiredRole !== user.role && user.role !== 'ADMIN') return false;

      // 개발 단계: 담당 개발자 목록에 포함되고 아직 미완료인 경우
      if (stage.name === '개발' && user.role === 'DEVELOPER') {
        const myEntry = t.developers.find(d => d.userId === user.id);
        return myEntry && !myEntry.completedAt;
      }

      // 요청승인: 요청자 부서 APPROVER만
      if (stage.name === '요청승인' && user.role === 'APPROVER') {
        return t.requester?.departmentId === user.departmentId;
      }

      // handlerDeptId 제한이 있는 단계
      if (stage.handlerDeptId && user.role !== 'ADMIN') {
        return stage.handlerDeptId === user.departmentId;
      }

      return true;
    });

    res.json({ tickets: actionable, total: actionable.length });
  } catch (err) { next(err); }
});

// 내가 참여한 적 있는 티켓 (요청자 / 처리 이력 / IT BA / 담당 개발자)
router.get('/involved', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const tickets = await prisma.ticket.findMany({
      where: {
        OR: [
          { requesterId: userId },
          { assigneeId: userId },
          { itBaId: userId },
          { stageHistories: { some: { actorId: userId } } },
          { developers: { some: { userId } } },
        ],
      },
      include: {
        ticketType: { select: { name: true } },
        requester: { select: { id: true, name: true, department: true } },
        assignee: { select: { id: true, name: true } },
        currentStage: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ tickets, total: tickets.length });
  } catch (err) { next(err); }
});

// 유사 티켓 검색
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const tickets = await prisma.ticket.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
        NOT: { status: 'CANCELLED' },
      },
      include: {
        ticketType: { select: { name: true } },
        requester: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    res.json(tickets);
  } catch (err) { next(err); }
});

router.get('/:id', getTicketById);
router.post('/:id/process', processStage);
router.post('/:id/comments', addComment);
router.post('/:id/attachments', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '파일을 선택해주세요.' });
    const attachment = await prisma.ticketAttachment.create({
      data: {
        ticketId: req.params.id,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedById: req.user.id,
      },
    });
    res.status(201).json(attachment);
  } catch (err) {
    next(err);
  }
});

// 연관 티켓
router.post('/:id/relations', async (req, res, next) => {
  try {
    const { relatedTicketId, relationType = 'RELATED_TO' } = req.body;
    if (!relatedTicketId) return res.status(400).json({ error: '연관 티켓 ID가 필요합니다.' });
    if (req.params.id === relatedTicketId) return res.status(400).json({ error: '자기 자신과 연관할 수 없습니다.' });

    const relation = await prisma.ticketRelation.create({
      data: { ticketId: req.params.id, relatedTicketId, relationType, createdById: req.user.id },
      include: {
        relatedTicket: {
          select: { id: true, ticketNumber: true, title: true, status: true, ticketType: { select: { name: true } } },
        },
      },
    });
    res.status(201).json(relation);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: '이미 연관된 티켓입니다.' });
    next(err);
  }
});

router.delete('/:id/relations/:relatedId', async (req, res, next) => {
  try {
    await prisma.ticketRelation.deleteMany({
      where: { ticketId: req.params.id, relatedTicketId: req.params.relatedId },
    });
    res.json({ message: '연관이 해제되었습니다.' });
  } catch (err) { next(err); }
});

// 합의
router.post('/consensus/request', requestConsensus);
router.patch('/consensus/:id', processConsensus);

// 요구사항
router.get('/:ticketId/requirements', getRequirements);
router.post('/:ticketId/requirements', createRequirement);
router.put('/requirements/:id', updateRequirement);
router.patch('/requirements/:id/status', updateRequirementStatus);

// 운영 이관
router.get('/:ticketId/deployment', getDeployment);
router.post('/:ticketId/deployment', createDeployment);
router.patch('/:ticketId/deployment/ready', setReady);
router.patch('/deployment/checklist/:itemId', toggleChecklistItem);
router.post('/:ticketId/deployment/result', recordResult);

// 참조자 (Watchers)
router.get('/:ticketId/watchers', async (req, res, next) => {
  try {
    const watchers = await prisma.ticketWatcher.findMany({
      where: { ticketId: req.params.ticketId },
      include: { user: { select: { id: true, name: true, role: true, department: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(watchers);
  } catch (err) { next(err); }
});
router.post('/:ticketId/watchers', async (req, res, next) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || !userIds.length) return res.status(400).json({ error: '사용자를 선택해주세요.' });
    const created = [];
    for (const userId of userIds) {
      const w = await prisma.ticketWatcher.upsert({
        where: { ticketId_userId: { ticketId: req.params.ticketId, userId } },
        update: {},
        create: { ticketId: req.params.ticketId, userId, addedById: req.user.id },
        include: { user: { select: { id: true, name: true, role: true, department: { select: { name: true } } } } },
      });
      created.push(w);
    }
    res.json(created);
  } catch (err) { next(err); }
});
router.delete('/:ticketId/watchers/:userId', async (req, res, next) => {
  try {
    await prisma.ticketWatcher.deleteMany({
      where: { ticketId: req.params.ticketId, userId: req.params.userId },
    });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
});

// 요구사항 의견 (RequirementComments)
router.get('/requirements/:reqId/comments', async (req, res, next) => {
  try {
    const comments = await prisma.requirementComment.findMany({
      where: { requirementId: req.params.reqId },
      include: { createdBy: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) { next(err); }
});
router.post('/requirements/:reqId/comments', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '내용을 입력해주세요.' });
    const comment = await prisma.requirementComment.create({
      data: { requirementId: req.params.reqId, content: content.trim(), createdById: req.user.id },
      include: { createdBy: { select: { id: true, name: true, role: true } } },
    });
    res.status(201).json(comment);
  } catch (err) { next(err); }
});
router.delete('/requirements/comments/:id', async (req, res, next) => {
  try {
    const comment = await prisma.requirementComment.findUnique({ where: { id: req.params.id } });
    if (!comment) return res.status(404).json({ error: '없는 의견입니다.' });
    if (comment.createdById !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }
    await prisma.requirementComment.delete({ where: { id: req.params.id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
});

module.exports = router;
