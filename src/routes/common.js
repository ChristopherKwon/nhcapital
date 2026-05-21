// src/routes/common.js — 로그인한 모든 사용자가 접근 가능한 공통 API
const router = require('express').Router();
const { authenticate } = require('../middlewares/auth');
const prisma = require('../utils/prisma');
const aiService = require('../services/aiService');

router.use(authenticate);

router.get('/ticket-types', async (req, res, next) => {
  try {
    const ticketTypes = await prisma.ticketType.findMany({
      where: { isActive: true },
      include: { workflowStages: { orderBy: { stageOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(ticketTypes);
  } catch (err) {
    next(err);
  }
});

router.get('/departments', async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  } catch (err) {
    next(err);
  }
});

// IT BA 검색 (DEVELOPER, MANAGER 역할 보유자)
router.get('/users/it-ba', async (req, res, next) => {
  try {
    const { q } = req.query;
    const users = await prisma.user.findMany({
      where: {
        role: { in: ['DEVELOPER', 'MANAGER'] },
        isActive: true,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { department: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 20,
    });
    res.json(users.map(u => ({
      id: u.id, name: u.name, role: u.role,
      department: u.department,
    })));
  } catch (err) {
    next(err);
  }
});

// IT팀 개발자 검색 (개발자 지정용 — IT개발팀 소속 DEVELOPER/MANAGER)
router.get('/users/it-team', async (req, res, next) => {
  try {
    const { q } = req.query;
    const itDept = await prisma.department.findFirst({ where: { code: 'IT' }, select: { id: true } });
    const users = await prisma.user.findMany({
      where: {
        departmentId: itDept?.id,
        isActive: true,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { department: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 20,
    });
    res.json(users.map(u => ({ id: u.id, name: u.name, role: u.role, department: u.department })));
  } catch (err) {
    next(err);
  }
});

// IT팀 매니저 검색 (책임자 지정용)
router.get('/users/it-managers', async (req, res, next) => {
  try {
    const { q } = req.query;
    const itDept = await prisma.department.findFirst({ where: { code: 'IT' }, select: { id: true } });
    const users = await prisma.user.findMany({
      where: {
        departmentId: itDept?.id,
        role: 'MANAGER',
        isActive: true,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { department: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 20,
    });
    res.json(users.map(u => ({ id: u.id, name: u.name, role: u.role, department: u.department })));
  } catch (err) { next(err); }
});

// APPROVER 검색 (합의자)
router.get('/users/approvers', async (req, res, next) => {
  try {
    const { q } = req.query;
    const users = await prisma.user.findMany({
      where: {
        role: 'APPROVER',
        isActive: true,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      include: { department: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 20,
    });
    res.json(users.map(u => ({
      id: u.id, name: u.name,
      department: u.department,
    })));
  } catch (err) {
    next(err);
  }
});

// 전체 사용자 검색 (참조자 지정용)
router.get('/users/all', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json([]);
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        name: { contains: q, mode: 'insensitive' },
      },
      include: { department: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 15,
    });
    res.json(users.map(u => ({ id: u.id, name: u.name, role: u.role, department: u.department })));
  } catch (err) { next(err); }
});

// 유사 티켓 검색
router.get('/tickets/similar', async (req, res, next) => {
  try {
    const { q, excludeId } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const results = await aiService.findSimilarTickets({
      text: q,
      excludeTicketId: excludeId || null,
      limit: 5,
    });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// AI 난이도 판정
router.post('/ai/estimate-difficulty', async (req, res, next) => {
  try {
    const { ticketData } = req.body;
    if (!ticketData?.title) return res.status(400).json({ error: '티켓 제목이 필요합니다.' });

    // 유사 티켓 먼저 조회
    const searchText = aiService.buildTicketSearchText(ticketData);
    const similarTickets = await aiService.findSimilarTickets({ text: searchText, limit: 3 });

    const result = await aiService.estimateDifficulty({ ticketData, similarTickets });
    res.json({ ...result, similarTickets });
  } catch (err) {
    next(err);
  }
});

// 도메인별 IT BA 자동 배정 조회
router.get('/domain-itba-mapping', async (req, res, next) => {
  try {
    const { domain } = req.query;
    if (!domain) return res.json(null);
    const mapping = await prisma.domainItbaMapping.findUnique({
      where: { domain },
      include: { itba: { select: { id: true, name: true, role: true, department: { select: { name: true } } } } },
    });
    res.json(mapping ? mapping.itba : null);
  } catch (err) { next(err); }
});

// 업무 도메인 목록
router.get('/business-domains', (req, res) => {
  res.json([
    '개인금융','기업금융','투자금융','오토리스','렌터카','승용','산업재','주택금융','일반리스','스탁론',
    '콜센터','상품운영기준','청구수납','채권관리','계약사후','신용조회','대외','마이데이터',
    '리스크','정보분석','내부통제','시너지','고객','파트너','통합결재','회계','자금','결산','예산','총무',
  ]);
});

module.exports = router;
