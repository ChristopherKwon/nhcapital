// src/controllers/collaborationController.js
const prisma = require('../utils/prisma');

// ─── 요구사항 협의 (COLLABORATE) ─────────────────────────────────────────────

const getRequirements = async (req, res, next) => {
  try {
    const items = await prisma.requirement.findMany({
      where: { ticketId: req.params.ticketId, status: { not: 'CANCELLED' } },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        annotations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { createdBy: { select: { id: true, name: true } } },
        },
        histories: { orderBy: { version: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(items);
  } catch (err) { next(err); }
};

const createRequirement = async (req, res, next) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: '요구사항 제목은 필수입니다.' });
    const item = await prisma.requirement.create({
      data: {
        ticketId: req.params.ticketId,
        title,
        description: description || null,
        createdById: req.user.id,
      },
      include: { createdBy: { select: { id: true, name: true, role: true } } },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

const updateRequirement = async (req, res, next) => {
  try {
    const { title, description } = req.body;
    const current = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });

    // Save history before update
    await prisma.requirementHistory.create({
      data: {
        requirementId: current.id,
        version: current.version,
        title: current.title,
        description: current.description,
        changedById: req.user.id,
        changeNote: '수정',
      },
    });

    // Reset consensus when requirements change
    await prisma.collaborationConsensus.upsert({
      where: { ticketId: current.ticketId },
      update: { requesterAgreed: false, itBaAgreed: false, requesterAgreedAt: null, itBaAgreedAt: null, resetAt: new Date() },
      create: { ticketId: current.ticketId },
    });

    const updated = await prisma.requirement.update({
      where: { id: req.params.id },
      data: { title, description, version: { increment: 1 }, updatedAt: new Date() },
      include: { createdBy: { select: { id: true, name: true, role: true } } },
    });
    res.json(updated);
  } catch (err) { next(err); }
};

const deleteRequirement = async (req, res, next) => {
  try {
    await prisma.requirement.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 이미지 어노테이션 ────────────────────────────────────────────────────────

const getAnnotation = async (req, res, next) => {
  try {
    const ann = await prisma.requirementAnnotation.findFirst({
      where: { requirementId: req.params.requirementId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    res.json(ann || null);
  } catch (err) { next(err); }
};

const getAnnotations = async (req, res, next) => {
  try {
    const anns = await prisma.requirementAnnotation.findMany({
      where: { requirementId: req.params.requirementId },
      orderBy: { createdAt: 'asc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    res.json(anns);
  } catch (err) { next(err); }
};

const saveAnnotation = async (req, res, next) => {
  try {
    const { imageData, shapes } = req.body;
    if (!imageData) return res.status(400).json({ error: '이미지 데이터가 필요합니다.' });

    const existing = await prisma.requirementAnnotation.findFirst({
      where: { requirementId: req.params.requirementId },
    });

    let ann;
    if (existing) {
      ann = await prisma.requirementAnnotation.update({
        where: { id: existing.id },
        data: { imageData, shapes: shapes || [], createdById: req.user.id, updatedAt: new Date() },
        include: { createdBy: { select: { id: true, name: true } } },
      });
    } else {
      ann = await prisma.requirementAnnotation.create({
        data: {
          requirementId: req.params.requirementId,
          imageData,
          shapes: shapes || [],
          createdById: req.user.id,
        },
        include: { createdBy: { select: { id: true, name: true } } },
      });
    }

    // Reset consensus when annotation changes
    const req_ = await prisma.requirementAnnotation.findUnique({
      where: { id: ann.id },
      include: { requirement: { select: { ticketId: true } } },
    });
    if (req_) {
      await prisma.collaborationConsensus.upsert({
        where: { ticketId: req_.requirement.ticketId },
        update: { requesterAgreed: false, itBaAgreed: false, requesterAgreedAt: null, itBaAgreedAt: null, resetAt: new Date() },
        create: { ticketId: req_.requirement.ticketId },
      });
    }

    res.json(ann);
  } catch (err) { next(err); }
};

const addAnnotation = async (req, res, next) => {
  try {
    const { imageData, shapes } = req.body;
    if (!imageData) return res.status(400).json({ error: '이미지 데이터가 필요합니다.' });
    const ann = await prisma.requirementAnnotation.create({
      data: {
        requirementId: req.params.requirementId,
        imageData,
        shapes: shapes || [],
        createdById: req.user.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    res.json(ann);
  } catch (err) { next(err); }
};

const deleteAnnotationById = async (req, res, next) => {
  try {
    await prisma.requirementAnnotation.delete({ where: { id: req.params.id } });
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

// ─── 요구사항 첨부파일 ────────────────────────────────────────────────────────

const getRequirementFiles = async (req, res, next) => {
  try {
    const files = await prisma.requirementFile.findMany({
      where: { requirementId: req.params.requirementId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(files);
  } catch (err) { next(err); }
};

const uploadRequirementFiles = async (req, res, next) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: '파일을 선택해주세요.' });
    const created = [];
    for (const file of files) {
      const f = await prisma.requirementFile.create({
        data: {
          requirementId: req.params.requirementId,
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedById: req.user.id,
        },
        include: { uploadedBy: { select: { id: true, name: true } } },
      });
      created.push(f);
    }
    res.json(created);
  } catch (err) { next(err); }
};

const downloadRequirementFile = async (req, res, next) => {
  try {
    const file = await prisma.requirementFile.findUnique({ where: { id: req.params.id } });
    if (!file) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const path = require('path');
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    res.download(path.resolve(uploadPath, file.filename), file.originalName);
  } catch (err) { next(err); }
};

// ─── 합의 (Consensus) ────────────────────────────────────────────────────────

const getConsensus = async (req, res, next) => {
  try {
    const consensus = await prisma.collaborationConsensus.findUnique({
      where: { ticketId: req.params.ticketId },
    });
    res.json(consensus || { requesterAgreed: false, itBaAgreed: false });
  } catch (err) { next(err); }
};

const agreeConsensus = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const role = req.user.role;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        currentStage: true,
        ticketType: { include: { workflowStages: { where: { isActive: true }, orderBy: { stageOrder: 'asc' } } } },
        stageHistories: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!ticket) return res.status(404).json({ error: '티켓을 찾을 수 없습니다.' });

    const isRequester = ticket.requesterId === req.user.id;
    const isItBa = ticket.itBaId === req.user.id || role === 'DEVELOPER' || role === 'MANAGER' || role === 'ADMIN';

    const updateData = {};
    if (isRequester) {
      updateData.requesterAgreed = true;
      updateData.requesterAgreedAt = new Date();
    } else if (isItBa) {
      updateData.itBaAgreed = true;
      updateData.itBaAgreedAt = new Date();
    } else {
      return res.status(403).json({ error: '합의 권한이 없습니다.' });
    }

    const consensus = await prisma.collaborationConsensus.upsert({
      where: { ticketId },
      update: updateData,
      create: { ticketId, ...updateData },
    });

    // 양측 모두 합의 완료 시 자동으로 다음 단계로 진행
    const bothAgreed = consensus.requesterAgreed && consensus.itBaAgreed;
    if (bothAgreed && ticket.currentStage?.actionType === 'COLLABORATE') {
      const stages = ticket.ticketType.workflowStages;
      const currentIndex = stages.findIndex(s => s.id === ticket.currentStage.id);
      const nextStage = stages[currentIndex + 1];
      if (nextStage) {
        const lastHistory = ticket.stageHistories[0];
        const stageStartAt = lastHistory?.createdAt || ticket.createdAt;
        const elapsedMinutes = Math.floor((new Date() - new Date(stageStartAt)) / 60000);
        const slaExceededYn = ticket.currentStage.slaTargetHours
          ? elapsedMinutes > ticket.currentStage.slaTargetHours * 60
          : false;

        await prisma.$transaction(async (tx) => {
          await tx.ticketStageHistory.create({
            data: {
              ticketId,
              stageId: ticket.currentStage.id,
              actorId: req.user.id,
              action: 'COMPLETED',
              comment: '요청자·IT BA 상호 합의 완료',
              elapsedMinutes,
              slaExceededYn,
            },
          });
          await tx.ticket.update({
            where: { id: ticketId },
            data: { currentStageId: nextStage.id },
          });
        });
        return res.json({ ...consensus, advanced: true });
      }
    }

    res.json(consensus);
  } catch (err) { next(err); }
};

const resetConsensus = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const consensus = await prisma.collaborationConsensus.upsert({
      where: { ticketId },
      update: { requesterAgreed: false, itBaAgreed: false, requesterAgreedAt: null, itBaAgreedAt: null, resetAt: new Date() },
      create: { ticketId },
    });
    res.json(consensus);
  } catch (err) { next(err); }
};

// ─── 병합 결재 (PARALLEL_APPROVE) ────────────────────────────────────────────

const getParallelApprovals = async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { currentStageId: true },
    });
    const approvals = await prisma.parallelApproval.findMany({
      where: { ticketId: req.params.ticketId, stageId: ticket?.currentStageId },
      include: { approver: { select: { id: true, name: true, role: true, department: { select: { name: true } } } } },
    });
    res.json(approvals);
  } catch (err) { next(err); }
};

const submitParallelApproval = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { action, comment } = req.body;
    if (!['APPROVED', 'REJECTED', 'RETURNED'].includes(action)) {
      return res.status(400).json({ error: '유효하지 않은 결재 액션입니다.' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { currentStage: true },
    });
    if (!ticket) return res.status(404).json({ error: '티켓을 찾을 수 없습니다.' });

    const canApprove = ['APPROVER', 'MANAGER', 'ADMIN'].includes(req.user.role);
    if (!canApprove) return res.status(403).json({ error: '결재 권한이 없습니다.' });

    // 책임자 검수 단계: IT 매니저가 먼저 결재해야 비매니저 결재 가능
    const isManagerFirstStage = ticket.currentStage.name === '책임자 검수';
    if (isManagerFirstStage && !['MANAGER', 'ADMIN'].includes(req.user.role)) {
      const managerApproval = await prisma.parallelApproval.findFirst({
        where: { ticketId, stageId: ticket.currentStageId, role: 'MANAGER', action: 'APPROVED' },
      });
      if (!managerApproval) {
        return res.status(403).json({ error: 'IT 매니저가 먼저 결재해야 합니다.' });
      }
    }

    const approval = await prisma.parallelApproval.upsert({
      where: { ticketId_approverId: { ticketId, approverId: req.user.id } },
      update: { action, comment, actedAt: new Date(), stageId: ticket.currentStageId },
      create: {
        ticketId,
        stageId: ticket.currentStageId,
        approverId: req.user.id,
        role: req.user.role,
        action,
        comment,
        actedAt: new Date(),
      },
      include: { approver: { select: { id: true, name: true, role: true } } },
    });

    // If REJECTED or RETURNED → reset and go back to stage 1
    if (action === 'REJECTED' || action === 'RETURNED') {
      const stage1 = await prisma.workflowStage.findFirst({
        where: { ticketTypeId: ticket.ticketTypeId, stageOrder: 1, isActive: true },
      });
      if (stage1) {
        await prisma.ticket.update({ where: { id: ticketId }, data: { currentStageId: stage1.id } });
        // Reset consensus so collaboration restarts
        await prisma.collaborationConsensus.upsert({
          where: { ticketId },
          update: { requesterAgreed: false, itBaAgreed: false, requesterAgreedAt: null, itBaAgreedAt: null, resetAt: new Date() },
          create: { ticketId },
        });
        // Delete current parallel approvals to start fresh
        await prisma.parallelApproval.deleteMany({ where: { ticketId } });
      }
      return res.json({ approval, redirectedTo: 'stage1' });
    }

    // Check if all required approvers have approved (filter by stageId to avoid counting previous stages)
    const allApprovals = await prisma.parallelApproval.findMany({
      where: { ticketId, stageId: ticket.currentStageId, action: 'APPROVED' },
    });

    // 책임자 검수: 매니저 1 + 결재자·부서장 2 = 3명 / 병합결재: 2명
    const requiredCount = isManagerFirstStage ? 3 : 2;
    if (allApprovals.length >= requiredCount) {
      const nextStage = await prisma.workflowStage.findFirst({
        where: { ticketTypeId: ticket.ticketTypeId, stageOrder: ticket.currentStage.stageOrder + 1, isActive: true },
      });
      if (nextStage) {
        await prisma.ticket.update({ where: { id: ticketId }, data: { currentStageId: nextStage.id } });
        return res.json({ approval, advanced: true });
      }
    }

    res.json({ approval, advanced: false });
  } catch (err) { next(err); }
};

// ─── 개발+테스트 통합 (COMBINED_WORK) ───────────────────────────────────────

const getCombinedWorkLog = async (req, res, next) => {
  try {
    const log = await prisma.combinedWorkLog.findUnique({
      where: { ticketId: req.params.ticketId },
      include: {
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    res.json(log || null);
  } catch (err) { next(err); }
};

const submitCombinedWork = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const { type } = req.body; // 'DEV' or 'TEST'
    const files = req.files || [];

    if (!type || !['DEV', 'TEST'].includes(type)) {
      return res.status(400).json({ error: '작업 유형(DEV/TEST)을 지정해야 합니다.' });
    }

    // Ensure work log exists
    const log = await prisma.combinedWorkLog.upsert({
      where: { ticketId },
      update: type === 'DEV' ? { devCompletedAt: new Date() } : { testCompletedAt: new Date() },
      create: {
        ticketId,
        devCompletedAt: type === 'DEV' ? new Date() : null,
        testCompletedAt: type === 'TEST' ? new Date() : null,
      },
    });

    // Save attachments
    for (const file of files) {
      await prisma.combinedWorkAttachment.create({
        data: {
          workLogId: log.id,
          type,
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedById: req.user.id,
        },
      });
    }

    const updated = await prisma.combinedWorkLog.findUnique({
      where: { ticketId },
      include: {
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
      },
    });

    // If both dev and test completed, advance to stage 4
    if (updated.devCompletedAt && updated.testCompletedAt) {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      const stage4 = await prisma.workflowStage.findFirst({
        where: { ticketTypeId: ticket.ticketTypeId, stageOrder: 4, isActive: true },
      });
      if (stage4) {
        await prisma.ticket.update({ where: { id: ticketId }, data: { currentStageId: stage4.id } });
        return res.json({ log: updated, advanced: true });
      }
    }

    res.json({ log: updated, advanced: false });
  } catch (err) { next(err); }
};

const submitTestComplete = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    const log = await prisma.combinedWorkLog.upsert({
      where: { ticketId },
      update: { testCompletedAt: new Date() },
      create: { ticketId, testCompletedAt: new Date() },
    });

    const updated = await prisma.combinedWorkLog.findUnique({ where: { ticketId } });

    if (updated.devCompletedAt && updated.testCompletedAt) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          currentStage: true,
          ticketType: { include: { workflowStages: { where: { isActive: true }, orderBy: { stageOrder: 'asc' } } } },
          stageHistories: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      const stages = ticket.ticketType.workflowStages;
      const currentIndex = stages.findIndex(s => s.id === ticket.currentStageId);
      const nextStage = stages[currentIndex + 1];
      if (nextStage) {
        const lastHistory = ticket.stageHistories[0];
        const stageStartAt = lastHistory?.createdAt || ticket.createdAt;
        const elapsedMinutes = Math.floor((new Date() - new Date(stageStartAt)) / 60000);
        const slaExceededYn = ticket.currentStage?.slaTargetHours
          ? elapsedMinutes > ticket.currentStage.slaTargetHours * 60
          : false;
        await prisma.$transaction(async (tx) => {
          await tx.ticketStageHistory.create({
            data: {
              ticketId,
              stageId: ticket.currentStageId,
              actorId: req.user.id,
              action: 'COMPLETED',
              comment: '개발·테스트 완료',
              elapsedMinutes,
              slaExceededYn,
            },
          });
          await tx.ticket.update({ where: { id: ticketId }, data: { currentStageId: nextStage.id } });
        });
        return res.json({ log: updated, advanced: true });
      }
    }

    res.json({ log: updated, advanced: false });
  } catch (err) { next(err); }
};

const downloadCombinedAttachment = async (req, res, next) => {
  try {
    const att = await prisma.combinedWorkAttachment.findUnique({ where: { id: req.params.id } });
    if (!att) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const path = require('path');
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    res.download(path.resolve(uploadPath, att.filename), att.originalName);
  } catch (err) { next(err); }
};

const cancelDevComplete = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const log = await prisma.combinedWorkLog.findUnique({ where: { ticketId } });
    if (!log?.devCompletedAt) return res.status(400).json({ error: '개발 완료 제출 내역이 없습니다.' });
    if (log.testCompletedAt) return res.status(400).json({ error: '테스트 완료가 이미 제출되어 취소할 수 없습니다.' });
    await prisma.combinedWorkLog.update({ where: { ticketId }, data: { devCompletedAt: null } });
    res.json({ message: '개발 완료가 취소되었습니다.' });
  } catch (err) { next(err); }
};

module.exports = {
  getRequirements, createRequirement, updateRequirement, deleteRequirement,
  getAnnotation, getAnnotations, saveAnnotation, addAnnotation, deleteAnnotationById,
  getRequirementFiles, uploadRequirementFiles, downloadRequirementFile,
  getConsensus, agreeConsensus, resetConsensus,
  getParallelApprovals, submitParallelApproval,
  getCombinedWorkLog, submitCombinedWork, submitTestComplete, downloadCombinedAttachment,
  cancelDevComplete,
};
