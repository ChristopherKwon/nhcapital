// src/controllers/testController.js
const prisma = require('../utils/prisma');
const audit = require('../services/auditService');

// ── 테스트 케이스 ─────────────────────────────────────────

const getTestCases = async (req, res, next) => {
  try {
    const testCases = await prisma.testCase.findMany({
      where: { ticketId: req.params.ticketId },
      include: {
        createdBy: { select: { id: true, name: true } },
        testResults: {
          orderBy: { executedAt: 'desc' },
          take: 1,
          include: { tester: { select: { id: true, name: true } } },
        },
        _count: { select: { testResults: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(testCases);
  } catch (err) { next(err); }
};

const createTestCase = async (req, res, next) => {
  try {
    const { title, preconditions, testSteps, expectedResult, priority } = req.body;
    if (!title || !testSteps || !expectedResult) {
      return res.status(400).json({ error: '제목, 테스트 단계, 기대 결과는 필수입니다.' });
    }
    const testCase = await prisma.testCase.create({
      data: {
        ticketId: req.params.ticketId,
        title, preconditions, testSteps, expectedResult,
        priority: priority || 'MEDIUM',
        createdById: req.user.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    audit.log({ ...audit.fromReq(req), action: 'CREATE_TEST_CASE', entityType: 'TEST_CASE', entityId: testCase.id, entityLabel: testCase.title, newValues: { ticketId: req.params.ticketId } });
    res.status(201).json(testCase);
  } catch (err) { next(err); }
};

const updateTestCase = async (req, res, next) => {
  try {
    const { title, preconditions, testSteps, expectedResult, priority, status } = req.body;
    const testCase = await prisma.testCase.update({
      where: { id: req.params.id },
      data: { title, preconditions, testSteps, expectedResult, priority, status },
    });
    res.json(testCase);
  } catch (err) { next(err); }
};

const deleteTestCase = async (req, res, next) => {
  try {
    await prisma.testCase.delete({ where: { id: req.params.id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ── 테스트 실행 ───────────────────────────────────────────

const executeTest = async (req, res, next) => {
  try {
    const { status, actualResult, comment } = req.body;
    if (!status || !['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'].includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 실행 결과입니다.' });
    }

    const statusMap = { PASS: 'PASS', FAIL: 'FAIL', BLOCKED: 'BLOCKED', SKIPPED: 'READY' };

    const [result] = await prisma.$transaction([
      prisma.testResult.create({
        data: { testCaseId: req.params.id, testerId: req.user.id, status, actualResult, comment },
        include: { tester: { select: { id: true, name: true } }, attachments: true },
      }),
      prisma.testCase.update({
        where: { id: req.params.id },
        data: { status: statusMap[status] },
      }),
    ]);

    // 증거 파일 첨부
    if (req.files?.length > 0) {
      await prisma.testResultAttachment.createMany({
        data: req.files.map(f => ({
          testResultId: result.id,
          filename: f.filename,
          originalName: f.originalname,
          mimetype: f.mimetype,
          size: f.size,
        })),
      });
    }

    audit.log({ ...audit.fromReq(req), action: 'EXECUTE_TEST', entityType: 'TEST_CASE', entityId: req.params.id, newValues: { status, comment } });
    res.status(201).json(result);
  } catch (err) { next(err); }
};

const getTestResults = async (req, res, next) => {
  try {
    const results = await prisma.testResult.findMany({
      where: { testCaseId: req.params.id },
      include: {
        tester: { select: { id: true, name: true } },
        defects: { select: { id: true, title: true, severity: true, status: true } },
        attachments: true,
      },
      orderBy: { executedAt: 'desc' },
    });
    res.json(results);
  } catch (err) { next(err); }
};

// ── 결함 ─────────────────────────────────────────────────

const getDefects = async (req, res, next) => {
  try {
    const where = {};
    if (req.params.ticketId) where.ticketId = req.params.ticketId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.severity) where.severity = req.query.severity;

    const defects = await prisma.defect.findMany({
      where,
      include: {
        reporter: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        ticket: { select: { id: true, ticketNumber: true, title: true } },
        testResult: { select: { id: true, status: true } },
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(defects);
  } catch (err) { next(err); }
};

const createDefect = async (req, res, next) => {
  try {
    const { title, description, severity, assigneeId, testResultId } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: '제목과 설명은 필수입니다.' });
    }
    const defect = await prisma.defect.create({
      data: {
        ticketId: req.params.ticketId,
        title, description,
        severity: severity || 'MEDIUM',
        reporterId: req.user.id,
        assigneeId: assigneeId || null,
        testResultId: testResultId || null,
      },
      include: {
        reporter: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    audit.log({ ...audit.fromReq(req), action: 'CREATE_DEFECT', entityType: 'DEFECT', entityId: defect.id, entityLabel: defect.title, newValues: { ticketId: req.params.ticketId, severity } });
    res.status(201).json(defect);
  } catch (err) { next(err); }
};

const updateDefect = async (req, res, next) => {
  try {
    const { title, description, severity, status, assigneeId } = req.body;
    const data = { title, description, severity, status, assigneeId };
    if (status === 'RESOLVED' || status === 'CLOSED') data.resolvedAt = new Date();
    const defect = await prisma.defect.update({
      where: { id: req.params.id },
      data,
      include: {
        reporter: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    audit.log({ ...audit.fromReq(req), action: 'UPDATE_DEFECT', entityType: 'DEFECT', entityId: req.params.id, newValues: { status, severity, assigneeId } });
    res.json(defect);
  } catch (err) { next(err); }
};

const getAllDefects = async (req, res, next) => {
  try {
    const { status, severity, page = 1, limit = 20 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const [defects, total] = await Promise.all([
      prisma.defect.findMany({
        where,
        include: {
          reporter: { select: { id: true, name: true } },
          assignee: { select: { id: true, name: true } },
          ticket: { select: { id: true, ticketNumber: true, title: true } },
        },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: Number(limit),
      }),
      prisma.defect.count({ where }),
    ]);
    res.json({ defects, total });
  } catch (err) { next(err); }
};

const hasEvidence = async (req, res, next) => {
  try {
    const count = await prisma.testResultAttachment.count({
      where: {
        testResult: {
          testCase: { ticketId: req.params.ticketId },
          testerId: req.user.id,
        },
      },
    });
    res.json({ hasEvidence: count > 0, count });
  } catch (err) { next(err); }
};

module.exports = {
  getTestCases, createTestCase, updateTestCase, deleteTestCase,
  executeTest, getTestResults,
  getDefects, createDefect, updateDefect, getAllDefects,
  hasEvidence,
};
