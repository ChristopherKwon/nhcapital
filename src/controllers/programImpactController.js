// src/controllers/programImpactController.js
const prisma = require('../utils/prisma');
const aiService = require('../services/aiService');

async function recalcAndSave(ticketId) {
  try {
    const [ticket, impacts] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, title: true, aiEstimatedDifficulty: true, aiEstimatedDays: true, externalInterfaceCount: true, dbChangeRequired: true, itbaDifficultyOverride: true, isCustomerFacing: true, businessDomain: true, subCategory: true, targetSystem: true } }),
      prisma.programImpact.findMany({ where: { ticketId } }),
    ]);
    if (!ticket) return;

    const searchText = aiService.buildTicketSearchText(ticket);
    const similarTickets = await aiService.findSimilarTickets({ text: searchText, excludeTicketId: ticketId, limit: 3 });
    const result = await aiService.recalculateDifficulty({ ticketData: ticket, impactData: impacts, similarTickets });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        finalDifficulty: result.difficulty,
        aiEstimatedDays: result.estimatedDays,
        aiDifficultyReason: result.reason,
      },
    });
  } catch (err) { console.error('[recalcAndSave] 오류:', err.message); }
}

const getProgramImpacts = async (req, res, next) => {
  try {
    const items = await prisma.programImpact.findMany({
      where: { ticketId: req.params.ticketId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ programType: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(items);
  } catch (err) { next(err); }
};

const createProgramImpact = async (req, res, next) => {
  try {
    const { programType, programName, isNew, description, impactLevel, impactScope } = req.body;
    if (!programType || !programName) {
      return res.status(400).json({ error: '프로그램 유형과 프로그램명은 필수입니다.' });
    }
    const item = await prisma.programImpact.create({
      data: {
        ticketId: req.params.ticketId,
        programType, programName,
        isNew: isNew !== undefined ? Boolean(isNew) : true,
        description: description || null,
        impactLevel: impactLevel || 'MEDIUM',
        impactScope: impactScope || null,
        createdById: req.user.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    recalcAndSave(req.params.ticketId);
    res.status(201).json(item);
  } catch (err) { next(err); }
};

const updateProgramImpact = async (req, res, next) => {
  try {
    const { programType, programName, isNew, description, impactLevel, impactScope } = req.body;
    const item = await prisma.programImpact.update({
      where: { id: req.params.id },
      data: {
        programType, programName,
        isNew: isNew !== undefined ? Boolean(isNew) : undefined,
        description, impactLevel, impactScope,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    recalcAndSave(item.ticketId);
    res.json(item);
  } catch (err) { next(err); }
};

const deleteProgramImpact = async (req, res, next) => {
  try {
    const item = await prisma.programImpact.findUnique({ where: { id: req.params.id }, select: { ticketId: true } });
    await prisma.programImpact.delete({ where: { id: req.params.id } });
    if (item) recalcAndSave(item.ticketId);
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
};

module.exports = { getProgramImpacts, createProgramImpact, updateProgramImpact, deleteProgramImpact, recalcAndSave };
