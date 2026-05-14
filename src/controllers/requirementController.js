// src/controllers/requirementController.js
const prisma = require('../utils/prisma');
const audit = require('../services/auditService');

const getRequirements = async (req, res, next) => {
  try {
    const requirements = await prisma.requirement.findMany({
      where: { ticketId: req.params.ticketId },
      include: {
        createdBy: { select: { id: true, name: true } },
        histories: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { version: 'desc' },
        },
        annotations: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(requirements);
  } catch (err) { next(err); }
};

const createRequirement = async (req, res, next) => {
  try {
    const { title, description } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: '요구사항 제목은 필수입니다.' });

    const req_ = await prisma.requirement.create({
      data: {
        ticketId: req.params.ticketId,
        title: title.trim(),
        description: description?.trim() || null,
        createdById: req.user.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    audit.log({ ...audit.fromReq(req), action: 'CREATE_REQUIREMENT', entityType: 'REQUIREMENT', entityId: req_.id, entityLabel: req_.title, newValues: { ticketId: req.params.ticketId } });
    res.status(201).json(req_);
  } catch (err) { next(err); }
};

const updateRequirement = async (req, res, next) => {
  try {
    const { title, description, changeNote } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: '요구사항 제목은 필수입니다.' });

    const current = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });
    if (current.status === 'CANCELLED') return res.status(400).json({ error: '취소된 요구사항은 수정할 수 없습니다.' });

    const updated = await prisma.$transaction(async (tx) => {
      // 변경 전 내용을 이력으로 저장
      await tx.requirementHistory.create({
        data: {
          requirementId: current.id,
          version: current.version,
          title: current.title,
          description: current.description,
          changedById: req.user.id,
          changeNote: changeNote?.trim() || null,
        },
      });
      return tx.requirement.update({
        where: { id: current.id },
        data: { title: title.trim(), description: description?.trim() || null, version: current.version + 1 },
        include: {
          createdBy: { select: { id: true, name: true } },
          histories: {
            include: { changedBy: { select: { id: true, name: true } } },
            orderBy: { version: 'desc' },
          },
        },
      });
    });
    audit.log({ ...audit.fromReq(req), action: 'UPDATE_REQUIREMENT', entityType: 'REQUIREMENT', entityId: current.id, entityLabel: title, oldValues: { title: current.title, description: current.description }, newValues: { title, description, changeNote } });
    res.json(updated);
  } catch (err) { next(err); }
};

const updateRequirementStatus = async (req, res, next) => {
  try {
    const { status, changeNote } = req.body;
    if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태입니다.' });
    }

    const current = await prisma.requirement.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: '요구사항을 찾을 수 없습니다.' });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.requirementHistory.create({
        data: {
          requirementId: current.id,
          version: current.version,
          title: current.title,
          description: current.description,
          changedById: req.user.id,
          changeNote: changeNote || `상태 변경: ${status}`,
        },
      });
      return tx.requirement.update({
        where: { id: current.id },
        data: { status, version: current.version + 1 },
        include: { createdBy: { select: { id: true, name: true } } },
      });
    });
    audit.log({ ...audit.fromReq(req), action: 'CHANGE_REQUIREMENT_STATUS', entityType: 'REQUIREMENT', entityId: current.id, entityLabel: current.title, oldValues: { status: current.status }, newValues: { status, changeNote } });
    res.json(updated);
  } catch (err) { next(err); }
};

module.exports = { getRequirements, createRequirement, updateRequirement, updateRequirementStatus };
