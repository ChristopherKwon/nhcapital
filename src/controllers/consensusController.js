// src/controllers/consensusController.js
const prisma = require('../utils/prisma');
const { createNotification } = require('../services/notificationService');

const requestConsensus = async (req, res, next) => {
  try {
    const { ticketId, departmentIds } = req.body;
    if (!ticketId || !departmentIds?.length) {
      return res.status(400).json({ error: '티켓 ID와 부서를 선택해주세요.' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) return res.status(404).json({ error: '티켓을 찾을 수 없습니다.' });

    const created = await prisma.ticketConsensus.createMany({
      data: departmentIds.map(deptId => ({
        ticketId,
        departmentId: deptId,
        isMandatory: false,
      })),
    });

    // 해당 부서 APPROVER에게 알림
    for (const deptId of departmentIds) {
      const approvers = await prisma.user.findMany({
        where: { departmentId: deptId, role: 'APPROVER', isActive: true },
      });
      for (const approver of approvers) {
        await createNotification({
          userId: approver.id,
          ticketId,
          type: 'CONSENSUS_REQUESTED',
          message: `티켓 [${ticket.ticketNumber}]의 합의 요청이 있습니다.`,
        });
      }
    }

    res.status(201).json({ message: '합의 요청이 등록되었습니다.', count: created.count });
  } catch (err) {
    next(err);
  }
};

const processConsensus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, comment } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(action)) {
      return res.status(400).json({ error: '유효하지 않은 액션입니다.' });
    }

    const consensus = await prisma.ticketConsensus.findUnique({
      where: { id },
      include: { ticket: true, department: true },
    });

    if (!consensus) return res.status(404).json({ error: '합의 요청을 찾을 수 없습니다.' });
    if (consensus.status !== 'PENDING') {
      return res.status(400).json({ error: '이미 처리된 합의 요청입니다.' });
    }

    // 해당 부서 APPROVER만 처리 가능
    if (req.user.role !== 'ADMIN') {
      if (req.user.role !== 'APPROVER' || req.user.departmentId !== consensus.departmentId) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }
    }

    await prisma.ticketConsensus.update({
      where: { id },
      data: {
        status: action,
        approverId: req.user.id,
        comment,
        respondedAt: new Date(),
      },
    });

    await createNotification({
      userId: consensus.ticket.requesterId,
      ticketId: consensus.ticketId,
      type: 'APPROVAL_COMPLETED',
      message: `티켓 [${consensus.ticket.ticketNumber}] 합의가 ${action === 'APPROVED' ? '승인' : '반려'}되었습니다.`,
    });

    res.json({ message: '합의 처리가 완료되었습니다.' });
  } catch (err) {
    next(err);
  }
};

const getMyConsensusRequests = async (req, res, next) => {
  try {
    const consensus = await prisma.ticketConsensus.findMany({
      where: {
        department: { users: { some: { id: req.user.id } } },
        status: 'PENDING',
      },
      include: {
        ticket: {
          include: {
            ticketType: true,
            requester: { select: { id: true, name: true, department: true } },
            currentStage: true,
          },
        },
        department: true,
      },
      orderBy: { requestedAt: 'desc' },
    });

    res.json(consensus);
  } catch (err) {
    next(err);
  }
};

module.exports = { requestConsensus, processConsensus, getMyConsensusRequests };
