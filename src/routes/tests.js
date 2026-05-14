// src/routes/tests.js
const router = require('express').Router();
const path = require('path');
const multer = require('multer');
const { authenticate } = require('../middlewares/auth');
const {
  getTestCases, createTestCase, updateTestCase, deleteTestCase,
  executeTest, getTestResults,
  getDefects, createDefect, updateDefect, getAllDefects,
  hasEvidence,
} = require('../controllers/testController');
const {
  getProgramImpacts, createProgramImpact, updateProgramImpact, deleteProgramImpact,
} = require('../controllers/programImpactController');
const prisma = require('../utils/prisma');

const upload = multer({
  storage: multer.diskStorage({
    destination: process.env.UPLOAD_PATH || './uploads',
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 10485760 },
});

router.use(authenticate);

// 티켓별 테스트 케이스
router.get('/tickets/:ticketId/test-cases', getTestCases);
router.get('/tickets/:ticketId/has-evidence', hasEvidence);
router.post('/tickets/:ticketId/test-cases', createTestCase);
router.put('/test-cases/:id', updateTestCase);
router.delete('/test-cases/:id', deleteTestCase);

// 테스트 실행 (파일 첨부 지원) & 결과
router.post('/test-cases/:id/execute', upload.array('files', 10), executeTest);
router.get('/test-cases/:id/results', getTestResults);

// 증거 파일 다운로드
router.get('/attachments/:id/download', async (req, res, next) => {
  try {
    const att = await prisma.testResultAttachment.findUnique({ where: { id: req.params.id } });
    if (!att) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    res.download(path.resolve(uploadPath, att.filename), att.originalName);
  } catch (err) { next(err); }
});

// 티켓별 결함
router.get('/tickets/:ticketId/defects', getDefects);
router.post('/tickets/:ticketId/defects', createDefect);

// 결함 수정
router.put('/defects/:id', updateDefect);

// 전체 결함 목록 (관리자)
router.get('/defects', getAllDefects);

// 프로그램 영향도 분석
router.get('/tickets/:ticketId/program-impacts', getProgramImpacts);
router.post('/tickets/:ticketId/program-impacts', createProgramImpact);
router.put('/program-impacts/:id', updateProgramImpact);
router.delete('/program-impacts/:id', deleteProgramImpact);

// IT BA 분석 항목 저장 + 난이도 재산정
router.patch('/tickets/:ticketId/itba-analysis', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { externalInterfaceCount, dbChangeRequired, itbaDifficultyOverride, isCustomerFacing } = req.body;

    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        externalInterfaceCount: externalInterfaceCount ?? undefined,
        dbChangeRequired: dbChangeRequired != null ? Boolean(dbChangeRequired) : undefined,
        itbaDifficultyOverride: itbaDifficultyOverride || null,
        isCustomerFacing: isCustomerFacing != null ? Boolean(isCustomerFacing) : undefined,
      },
    });

    // 난이도 재산정 트리거
    const { recalcAndSave } = require('../controllers/programImpactController');
    await recalcAndSave(ticketId);

    const updated = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { finalDifficulty: true, aiEstimatedDays: true, aiDifficultyReason: true, externalInterfaceCount: true, dbChangeRequired: true, itbaDifficultyOverride: true },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// AI 테스트 케이스 자동 생성
router.post('/tickets/:ticketId/ai-test-cases', async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { requirementId } = req.body;
    if (!requirementId) return res.status(400).json({ error: 'requirementId가 필요합니다.' });

    const [ticket, requirement] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ticketId }, select: { title: true } }),
      prisma.requirement.findUnique({ where: { id: requirementId }, select: { title: true, description: true } }),
    ]);
    if (!ticket || !requirement) return res.status(404).json({ error: '티켓 또는 요구사항을 찾을 수 없습니다.' });

    const { generateTestCases } = require('../services/aiService');
    const cases = await generateTestCases({ ticketTitle: ticket.title, requirement });
    if (!cases.length) return res.status(422).json({ error: 'AI가 테스트 케이스를 생성하지 못했습니다.' });

    const created = await Promise.all(cases.map(c =>
      prisma.testCase.create({
        data: {
          ticketId,
          title: c.title,
          preconditions: c.preconditions || null,
          testSteps: c.testSteps,
          expectedResult: c.expectedResult,
          priority: ['LOW','MEDIUM','HIGH','CRITICAL'].includes(c.priority) ? c.priority : 'MEDIUM',
          createdById: req.user.id,
        },
        include: { createdBy: { select: { id: true, name: true } } },
      })
    ));

    res.json(created);
  } catch (err) { next(err); }
});

module.exports = router;
