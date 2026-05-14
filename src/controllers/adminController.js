// src/controllers/adminController.js
const prisma = require('../utils/prisma');
const bcrypt = require('bcryptjs');

const getDashboard = async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30));
    const [totalTickets, inProgressTickets, completedTickets, rejectedTickets, ticketsByTypeRaw, ticketTypes] =
      await Promise.all([
        prisma.ticket.count(),
        prisma.ticket.count({ where: { status: 'IN_PROGRESS' } }),
        prisma.ticket.count({ where: { status: 'COMPLETED' } }),
        prisma.ticket.count({ where: { status: 'REJECTED' } }),
        prisma.ticket.groupBy({
          by: ['ticketTypeId'],
          _count: { id: true },
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.ticketType.findMany({ select: { id: true, name: true } }),
      ]);
    const typeNameMap = Object.fromEntries(ticketTypes.map(t => [t.id, t.name]));
    const ticketsByType = ticketsByTypeRaw.map(t => ({ ...t, typeName: typeNameMap[t.ticketTypeId] || t.ticketTypeId }));

    // SLA: 단계 이력 기반 초과 통계
    const [slaExceededCount, slaTotalCount, activeTicketsForSla] = await Promise.all([
      // 이력 중 SLA 초과 건수
      prisma.ticketStageHistory.count({ where: { slaExceededYn: true } }),
      // SLA 설정이 있는 단계의 총 처리 이력 수
      prisma.ticketStageHistory.count({ where: { elapsedMinutes: { not: null } } }),
      // 현재 SLA 초과 진행 중인 티켓 목록
      prisma.ticket.findMany({
        where: { status: 'IN_PROGRESS' },
        include: {
          ticketType: { select: { name: true } },
          requester: { select: { name: true } },
          currentStage: { select: { name: true, slaTargetHours: true } },
          stageHistories: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // 현재 단계 체류시간 계산
    const now = new Date();
    const slaStatus = activeTicketsForSla.map(t => {
      const stageStart = t.stageHistories[0]?.createdAt || t.createdAt;
      const elapsedH = Math.floor((now - new Date(stageStart)) / 3600000);
      const target = t.currentStage?.slaTargetHours;
      const pct = target ? Math.round((elapsedH / target) * 100) : null;
      return {
        id: t.id, ticketNumber: t.ticketNumber, title: t.title,
        typeName: t.ticketType.name, requesterName: t.requester.name,
        stageName: t.currentStage?.name,
        elapsedHours: elapsedH,
        slaTargetHours: target,
        slaPercent: pct,
        slaExceeded: target ? elapsedH > target : false,
      };
    }).sort((a, b) => (b.slaPercent ?? 0) - (a.slaPercent ?? 0));

    const slaRate = slaTotalCount > 0
      ? Math.round(((slaTotalCount - slaExceededCount) / slaTotalCount) * 100)
      : null;

    res.json({
      summary: { totalTickets, inProgressTickets, completedTickets, rejectedTickets },
      slaRate,
      slaExceededCount,
      slaTotalCount,
      slaStatus,
      ticketsByType,
    });
  } catch (err) {
    next(err);
  }
};

const getUsers = async (req, res, next) => {
  try {
    const { role, departmentId, page = 1, limit = 20 } = req.query;
    const where = {};
    if (role) where.role = role;
    if (departmentId) where.departmentId = departmentId;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, employeeId: true, name: true, email: true,
          role: true, isActive: true, createdAt: true,
          department: true,
        },
        skip: (page - 1) * limit,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total });
  } catch (err) {
    next(err);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { employeeId, name, email, role, departmentId, password } = req.body;
    if (!employeeId || !name || !email || !password) {
      return res.status(400).json({ error: '필수 항목을 입력해주세요.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { employeeId, name, email, passwordHash, role: role || 'USER', departmentId },
      select: { id: true, employeeId: true, name: true, email: true, role: true },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, departmentId, isActive } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, email, role, departmentId, isActive },
      select: { id: true, employeeId: true, name: true, email: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

const getDepartments = async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  } catch (err) {
    next(err);
  }
};

const createDepartment = async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ error: '부서명과 코드를 입력해주세요.' });
    const dept = await prisma.department.create({ data: { name, code } });
    res.status(201).json(dept);
  } catch (err) {
    next(err);
  }
};

const getTicketTypes = async (req, res, next) => {
  try {
    const ticketTypes = await prisma.ticketType.findMany({
      include: { workflowStages: { orderBy: { stageOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    res.json(ticketTypes);
  } catch (err) {
    next(err);
  }
};

const createTicketType = async (req, res, next) => {
  try {
    const { code, name, description, stages } = req.body;
    if (!code || !name || !stages?.length) {
      return res.status(400).json({ error: '코드, 이름, 단계 정보를 입력해주세요.' });
    }

    const ticketType = await prisma.$transaction(async (tx) => {
      const tt = await tx.ticketType.create({ data: { code, name, description } });
      await tx.workflowStage.createMany({
        data: stages.map((s, i) => ({
          ticketTypeId: tt.id,
          stageOrder: i + 1,
          name: s.name,
          description: s.description,
          requiredRole: s.requiredRole,
          actionType: s.actionType,
          isRequesterStage: s.isRequesterStage || false,
          requiredDepartmentId: s.requiredDepartmentId || null,
        })),
      });
      return tt;
    });

    res.status(201).json(ticketType);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard, getUsers, createUser, updateUser,
  getDepartments, createDepartment,
  getTicketTypes, createTicketType,
};
