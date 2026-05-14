// src/routes/collaboration.js
const router = require('express').Router();
const path = require('path');
const multer = require('multer');
const { authenticate } = require('../middlewares/auth');
const {
  getRequirements, createRequirement, updateRequirement, deleteRequirement,
  getAnnotation, getAnnotations, saveAnnotation, addAnnotation, deleteAnnotationById,
  getRequirementFiles, uploadRequirementFiles, downloadRequirementFile,
  getConsensus, agreeConsensus, resetConsensus,
  getParallelApprovals, submitParallelApproval,
  getCombinedWorkLog, submitCombinedWork, submitTestComplete, downloadCombinedAttachment,
  cancelDevComplete,
} = require('../controllers/collaborationController');

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

// 요구사항 CRUD
router.get('/tickets/:ticketId/requirements', getRequirements);
router.post('/tickets/:ticketId/requirements', createRequirement);
router.put('/requirements/:id', updateRequirement);
router.delete('/requirements/:id', deleteRequirement);

// 이미지 어노테이션
router.get('/requirements/:requirementId/annotation', getAnnotation);
router.post('/requirements/:requirementId/annotation', saveAnnotation);
router.get('/requirements/:requirementId/annotations', getAnnotations);
router.post('/requirements/:requirementId/annotations', addAnnotation);
router.delete('/annotations/:id', deleteAnnotationById);

// 요구사항 첨부파일
router.get('/requirements/:requirementId/files', getRequirementFiles);
router.post('/requirements/:requirementId/files', upload.array('files', 20), uploadRequirementFiles);
router.get('/requirement-files/:id/download', downloadRequirementFile);

// 합의
router.get('/tickets/:ticketId/consensus', getConsensus);
router.post('/tickets/:ticketId/consensus/agree', agreeConsensus);
router.post('/tickets/:ticketId/consensus/reset', resetConsensus);

// 병합 결재
router.get('/tickets/:ticketId/parallel-approvals', getParallelApprovals);
router.post('/tickets/:ticketId/parallel-approvals', submitParallelApproval);

// 개발+테스트 통합
router.get('/tickets/:ticketId/combined-work', getCombinedWorkLog);
router.post('/tickets/:ticketId/combined-work', upload.array('files', 10), submitCombinedWork);
router.post('/tickets/:ticketId/combined-work/test-complete', submitTestComplete);
router.delete('/tickets/:ticketId/combined-work/dev', cancelDevComplete);
router.get('/combined-work/attachments/:id/download', downloadCombinedAttachment);

module.exports = router;
