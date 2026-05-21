// src/controllers/ticketController.js
const prisma = require('../utils/prisma');
const { createNotification } = require('../services/notificationService');
const { generateTicketNumber } = require('../utils/ticketUtils');
const audit = require('../services/auditService');
const aiService = require('../services/aiService');

const getTickets = async (req, res, next) => {
  try {
    const { status, ticketTypeId, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (ticketTypeId) where.ticketTypeId = ticketTypeId;

    // 일반 사용자는 본인 티켓만 조회
    if (req.user.role === 'USER') {
      where.requesterId = req.user.id;
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          ticketType: true,
          requester: { select: { id: true, name: true, department: true } },
          assignee: { select: { id: true, name: true } },
          currentStage: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: Number(skip),
        take: Number(limit),
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({ tickets, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
};

const getTicketById = async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        ticketType: {
          include: {
            workflowStages: { orderBy: { stageOrder: 'asc' } },
          },
        },
        requester: { select: { id: true, name: true, email: true, department: true } },
        assignee: { select: { id: true, name: true } },
        itBa: { select: { id: true, name: true, role: true } },
        manager: { select: { id: true, name: true, role: true } },
        developers: { include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { assignedAt: 'asc' } },
        currentStage: true,
        stageHistories: {
          include: {
            stage: true,
            actor: { select: { id: true, name: true, role: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        consensus: {
          include: {
            department: true,
            approver: { select: { id: true, name: true } },
          },
        },
        comments: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: { uploadedBy: { select: { id: true, name: true } } },
        },
        relations: {
          include: {
            relatedTicket: {
              select: { id: true, ticketNumber: true, title: true, status: true, ticketType: { select: { name: true } } },
            },
          },
        },
        watchers: {
          include: { user: { select: { id: true, name: true, role: true, department: { select: { name: true } } } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) return res.status(404).json({ error: '티켓을 찾을 수 없습니다.' });

    if (req.user.role === 'USER' && ticket.requesterId !== req.user.id) {
      // 참조자(watcher)도 접근 허용
      const isWatcher = ticket.watchers?.some(w => w.userId === req.user.id);
      if (!isWatcher) return res.status(403).json({ error: '권한이 없습니다.' });
    }

    res.json(ticket);
  } catch (err) {
    next(err);
  }
};

const createTicket = async (req, res, next) => {
  try {
    const { ticketTypeId, title, description, priority, dueDate,
            subCategory, targetSystem, businessDomain, itBaId, consensusApproverIds,
            aiEstimatedDifficulty, aiEstimatedDays, aiDifficultyReason } = req.body;

    if (!ticketTypeId || !title || !description) {
      return res.status(400).json({ error: '티켓 유형, 제목, 내용은 필수입니다.' });
    }

    const ticketType = await prisma.ticketType.findUnique({
      where: { id: ticketTypeId },
      include: { workflowStages: { orderBy: { stageOrder: 'asc' } } },
    });
    if (!ticketType || !ticketType.isActive) {
      return res.status(400).json({ error: '유효하지 않은 티켓 유형입니다.' });
    }

    const firstStage = ticketType.workflowStages[0];
    const secondStage = ticketType.workflowStages[1];
    const ticketNumber = await generateTicketNumber();

    const ticket = await prisma.$transaction(async (tx) => {
      const newTicket = await tx.ticket.create({
        data: {
          ticketNumber,
          ticketTypeId,
          title,
          description,
          requesterId: req.user.id,
          currentStageId: firstStage?.id,
          priority: priority || 'MEDIUM',
          dueDate: dueDate ? new Date(dueDate) : null,
          subCategory: subCategory || null,
          targetSystem: targetSystem || null,
          businessDomain: businessDomain || null,
          itBaId: itBaId || null,
          aiEstimatedDifficulty: aiEstimatedDifficulty || null,
          aiEstimatedDays: aiEstimatedDays || null,
          aiDifficultyReason: aiDifficultyReason || null,
        },
      });

      // 1단계 시작 히스토리
      if (firstStage) {
        await tx.ticketStageHistory.create({
          data: {
            ticketId: newTicket.id,
            stageId: firstStage.id,
            actorId: req.user.id,
            action: 'COMPLETED',
            comment: '티켓 등록',
          },
        });
      }

      // 자료수정: 필수 합의 부서 자동 추가
      const mandatoryStage = ticketType.workflowStages.find(s => s.requiredDepartmentId);
      if (mandatoryStage?.requiredDepartmentId) {
        await tx.ticketConsensus.create({
          data: {
            ticketId: newTicket.id,
            departmentId: mandatoryStage.requiredDepartmentId,
            isMandatory: true,
          },
        });
      }

      // 선택적 합의 (특정 결재자 지정)
      if (consensusApproverIds?.length > 0) {
        const approvers = await tx.user.findMany({
          where: { id: { in: consensusApproverIds }, role: 'APPROVER' },
          select: { id: true, departmentId: true },
        });
        await tx.ticketConsensus.createMany({
          data: approvers.map(a => ({
            ticketId: newTicket.id,
            departmentId: a.departmentId,
            approverId: a.id,
            isMandatory: false,
          })),
        });
      }

      return newTicket;
    });

    // 다음 단계 담당자에게 알림 (요청승인은 요청자 부서 APPROVER에게만)
    const nextStage = ticketType.workflowStages[1];
    if (nextStage) {
      await notifyStageUsers(ticket.id, nextStage, `새 티켓이 등록되었습니다: ${title}`, req.user.departmentId);
    }

    // 임베딩 비동기 저장 (응답을 블로킹하지 않음)
    if (aiService.VECTOR_SEARCH_ENABLED) {
      const searchText = aiService.buildTicketSearchText({ title, description, businessDomain, subCategory, targetSystem });
      aiService.generateEmbedding(searchText).then(() => null).catch(() => {});
    }

    audit.log({ ...audit.fromReq(req), action: 'CREATE_TICKET', entityType: 'TICKET', entityId: ticket.id, entityLabel: ticket.ticketNumber, newValues: { title, ticketTypeId, priority } });
    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
};

const processStage = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, comment, assigneeId, developerIds, managerId } = req.body;

    if (!action || !['APPROVED', 'REJECTED', 'RETURNED', 'COMPLETED'].includes(action)) {
      return res.status(400).json({ error: '유효하지 않은 액션입니다.' });
    }

    // PARALLEL_APPROVE and COMBINED_WORK stages use their own API endpoints
    const ticket0 = await prisma.ticket.findUnique({
      where: { id },
      include: { currentStage: true },
    });
    if (ticket0?.currentStage?.actionType === 'PARALLEL_APPROVE') {
      return res.status(400).json({ error: '병합 결재는 /api/collab/tickets/:id/parallel-approvals 엔드포인트를 사용하세요.' });
    }
    if (ticket0?.currentStage?.actionType === 'COMBINED_WORK') {
      return res.status(400).json({ error: '개발/테스트 작업은 /api/collab/tickets/:id/combined-work 엔드포인트를 사용하세요.' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        currentStage: { include: { handlerDept: { select: { id: true, name: true } } } },
        ticketType: {
          include: { workflowStages: { orderBy: { stageOrder: 'asc' } } },
        },
        consensus: true,
        stageHistories: { orderBy: { createdAt: 'desc' }, take: 1 },
        requester: { select: { id: true, departmentId: true, department: { select: { name: true } } } },
        developers: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    if (!ticket) return res.status(404).json({ error: '티켓을 찾을 수 없습니다.' });
    if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') {
      return res.status(400).json({ error: '처리할 수 없는 티켓 상태입니다.' });
    }

    const currentStage = ticket.currentStage;
    const userRole = req.user.role;

    // 요청자 단계는 요청자 본인만 처리 가능
    if (currentStage.isRequesterStage && ticket.requesterId !== req.user.id) {
      return res.status(403).json({ error: '요청자만 처리할 수 있는 단계입니다.' });
    }

    // 역할 권한 확인 (요청자 단계 제외)
    if (!currentStage.isRequesterStage && currentStage.requiredRole !== userRole) {
      if (userRole !== 'ADMIN') {
        return res.status(403).json({ error: '이 단계를 처리할 권한이 없습니다.' });
      }
    }

    // 요청승인 단계: 요청자 소속 부서의 APPROVER만 처리 가능 (ADMIN 제외)
    if (currentStage.name === '요청승인' && userRole === 'APPROVER') {
      const requesterDeptId = ticket.requester?.departmentId;
      if (requesterDeptId && req.user.departmentId !== requesterDeptId) {
        const deptName = ticket.requester?.department?.name || '';
        return res.status(403).json({ error: `요청승인은 요청자 소속 부서(${deptName})의 결재자만 처리할 수 있습니다.` });
      }
    }

    // 담당 부서 제한이 있는 단계: 지정 부서 소속만 처리 가능 (ADMIN 제외)
    if (currentStage.handlerDeptId && userRole !== 'ADMIN') {
      if (req.user.departmentId !== currentStage.handlerDeptId) {
        const deptName = currentStage.handlerDept?.name || '';
        return res.status(403).json({ error: `이 단계는 ${deptName} 소속만 처리할 수 있습니다.` });
      }
    }

    // 책임자 검수/배포결과 승인: 지정된 매니저만 처리 가능 (ADMIN 제외)
    if (currentStage.actionType === 'APPROVE' && currentStage.requiredRole === 'MANAGER' && userRole !== 'ADMIN') {
      if (ticket.managerId && ticket.managerId !== req.user.id) {
        return res.status(403).json({ error: '지정된 책임자만 처리할 수 있습니다.' });
      }
    }

    // 기존 합의(CONSENSUS 타입) 미완료 시 진행 불가
    const pendingConsensus = ticket.consensus.filter(c => c.status === 'PENDING');
    if (pendingConsensus.length > 0 && action !== 'REJECTED' && action !== 'RETURNED') {
      return res.status(400).json({ error: '대기 중인 합의 승인이 있습니다.' });
    }

    // COLLABORATE 단계: 양측 합의 완료 여부 확인
    if (currentStage.actionType === 'COLLABORATE' && action === 'COMPLETED') {
      const colConsensus = await prisma.collaborationConsensus.findUnique({ where: { ticketId: id } });
      if (!colConsensus?.requesterAgreed || !colConsensus?.itBaAgreed) {
        return res.status(400).json({ error: '요청자와 IT BA 양측이 모두 합의해야 다음 단계로 진행할 수 있습니다.' });
      }
    }

    const stages = ticket.ticketType.workflowStages;
    const currentIndex = stages.findIndex(s => s.id === currentStage.id);

    let nextStageId = null;
    let newStatus = ticket.status;

    if (action === 'REJECTED') {
      newStatus = 'REJECTED';
    } else if (action === 'RETURNED') {
      // 이전 단계로 복귀
      const prevStage = stages[currentIndex - 1];
      nextStageId = prevStage?.id || currentStage.id;
    } else {
      // 다음 단계로 진행
      const nextStage = stages[currentIndex + 1];
      if (nextStage) {
        nextStageId = nextStage.id;
      } else {
        // 마지막 단계 완료 시 요구사항 완료 여부 확인
        const activeReqs = await prisma.requirement.count({
          where: { ticketId: id, status: 'ACTIVE' },
        });
        if (activeReqs > 0) {
          return res.status(400).json({ error: `완료되지 않은 요구사항이 ${activeReqs}건 있습니다. 모든 요구사항을 완료해야 티켓을 종료할 수 있습니다.` });
        }
        newStatus = 'COMPLETED';
      }
    }

    // SLA 계산: 현재 단계 진입 시각 = 직전 이력의 createdAt (없으면 티켓 생성 시각)
    const lastHistory = ticket.stageHistories[0];
    const stageStartAt = lastHistory?.createdAt || ticket.createdAt;
    const now = new Date();
    const elapsedMinutes = Math.floor((now - new Date(stageStartAt)) / 60000);
    const slaExceededYn = currentStage.slaTargetHours
      ? elapsedMinutes > currentStage.slaTargetHours * 60
      : false;

    await prisma.$transaction(async (tx) => {
      await tx.ticketStageHistory.create({
        data: {
          ticketId: id,
          stageId: currentStage.id,
          actorId: req.user.id,
          action,
          comment,
          elapsedMinutes,
          slaExceededYn,
        },
      });

      await tx.ticket.update({
        where: { id },
        data: {
          currentStageId: nextStageId,
          status: newStatus,
          assigneeId: assigneeId || ticket.assigneeId,
          ...(managerId ? { managerId } : {}),
        },
      });

      // 개발자 다중 지정 (기존 목록 교체)
      if (developerIds?.length > 0) {
        await tx.ticketDeveloper.deleteMany({ where: { ticketId: id } });
        await tx.ticketDeveloper.createMany({
          data: developerIds.map(userId => ({ ticketId: id, userId })),
          skipDuplicates: true,
        });
      }
    });

    // 알림 발송
    const nextStage = stages[currentIndex + 1];
    if (nextStage && action !== 'REJECTED') {
      await notifyStageUsers(id, nextStage, `티켓 [${ticket.ticketNumber}]이 다음 단계로 이동했습니다: ${nextStage.name}`);
    }

    // 요청자에게 상태 변경 알림
    await createNotification({
      userId: ticket.requesterId,
      ticketId: id,
      type: action === 'REJECTED' ? 'TICKET_REJECTED' : 'STAGE_CHANGED',
      message: `티켓 [${ticket.ticketNumber}] 상태가 변경되었습니다.`,
    });

    audit.log({ ...audit.fromReq(req), action: 'PROCESS_STAGE', entityType: 'TICKET', entityId: id, entityLabel: ticket.ticketNumber, newValues: { action, stageName: currentStage.name, comment, newStatus } });
    res.json({ message: '처리되었습니다.' });
  } catch (err) {
    next(err);
  }
};

const notifyStageUsers = async (ticketId, stage, message, requesterDeptId = null) => {
  const where = { role: stage.requiredRole, isActive: true };

  // 담당 부서 지정이 있으면 해당 부서만
  if (stage.handlerDeptId) {
    where.departmentId = stage.handlerDeptId;
  } else if (stage.name === '요청승인' && requesterDeptId) {
    // 요청승인: 요청자 소속 부서의 APPROVER에게만 알림
    where.departmentId = requesterDeptId;
  }

  let users = await prisma.user.findMany({ where });

  // 대상자가 없으면 전체 해당 역할에게 폴백
  if (users.length === 0) {
    users = await prisma.user.findMany({ where: { role: stage.requiredRole, isActive: true } });
  }

  for (const user of users) {
    await createNotification({ userId: user.id, ticketId, type: 'APPROVAL_REQUESTED', message });
  }
};

const addComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ error: '티켓을 찾을 수 없습니다.' });

    const comment = await prisma.ticketComment.create({
      data: { ticketId: req.params.id, userId: req.user.id, content },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    await createNotification({
      userId: ticket.requesterId,
      ticketId: ticket.id,
      type: 'COMMENT_ADDED',
      message: `티켓 [${ticket.ticketNumber}]에 댓글이 등록되었습니다.`,
    });

    audit.log({ ...audit.fromReq(req), action: 'ADD_COMMENT', entityType: 'TICKET', entityId: ticket.id, entityLabel: ticket.ticketNumber });
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
};

module.exports = { getTickets, getTicketById, createTicket, processStage, addComment };
