// src/controllers/deploymentController.js
const prisma = require('../utils/prisma');
const audit = require('../services/auditService');

const CHECKLIST_TEMPLATE = [
  { category: '개발', itemText: '소스코드 최종 확인 및 병합 완료',     isMandatory: true,  displayOrder: 1 },
  { category: '테스트', itemText: '단위 테스트 통과 확인',              isMandatory: true,  displayOrder: 2 },
  { category: '테스트', itemText: '통합 테스트 통과 확인',              isMandatory: true,  displayOrder: 3 },
  { category: '테스트', itemText: '사용자 인수 테스트(UAT) 완료',       isMandatory: true,  displayOrder: 4 },
  { category: '보안',   itemText: '보안 취약점 점검 완료',              isMandatory: true,  displayOrder: 5 },
  { category: '문서',   itemText: '배포 가이드 문서 작성 완료',         isMandatory: true,  displayOrder: 6 },
  { category: '문서',   itemText: '운영 매뉴얼 업데이트 완료',          isMandatory: false, displayOrder: 7 },
  { category: '계획',   itemText: '롤백 계획 수립 완료',               isMandatory: true,  displayOrder: 8 },
  { category: '계획',   itemText: '배포 일정 관계자 공유 완료',         isMandatory: true,  displayOrder: 9 },
  { category: '계획',   itemText: '배포 전 데이터 백업 완료',           isMandatory: true,  displayOrder: 10 },
  { category: '확인',   itemText: 'DBA 검토 및 확인',                  isMandatory: false, displayOrder: 11 },
  { category: '확인',   itemText: '인프라팀 확인',                      isMandatory: false, displayOrder: 12 },
  { category: '확인',   itemText: '사용자 교육 완료',                   isMandatory: false, displayOrder: 13 },
];

const getDeployment = async (req, res, next) => {
  try {
    const plan = await prisma.deploymentPlan.findUnique({
      where: { ticketId: req.params.ticketId },
      include: {
        createdBy: { select: { id: true, name: true } },
        checklist: { orderBy: { displayOrder: 'asc' }, include: { checkedBy: { select: { id: true, name: true } } } },
        result: { include: { deployedBy: { select: { id: true, name: true } } } },
      },
    });
    res.json(plan);
  } catch (err) { next(err); }
};

const createDeployment = async (req, res, next) => {
  try {
    const { deployTarget, deployType, plannedAt, description } = req.body;
    if (!deployTarget || !deployType || !plannedAt || !description) {
      return res.status(400).json({ error: '이관 대상, 유형, 예정일시, 내용은 필수입니다.' });
    }

    const existing = await prisma.deploymentPlan.findUnique({ where: { ticketId: req.params.ticketId } });
    if (existing) return res.status(409).json({ error: '이미 이관 계획서가 등록되어 있습니다.' });

    const plan = await prisma.$transaction(async (tx) => {
      const p = await tx.deploymentPlan.create({
        data: {
          ticketId: req.params.ticketId,
          deployTarget, deployType,
          plannedAt: new Date(plannedAt),
          description,
          createdById: req.user.id,
        },
      });
      await tx.deployChecklistItem.createMany({
        data: CHECKLIST_TEMPLATE.map(item => ({ ...item, deploymentPlanId: p.id })),
      });
      return tx.deploymentPlan.findUnique({
        where: { id: p.id },
        include: {
          createdBy: { select: { id: true, name: true } },
          checklist: { orderBy: { displayOrder: 'asc' } },
        },
      });
    });

    audit.log({ ...audit.fromReq(req), action: 'CREATE_DEPLOYMENT', entityType: 'DEPLOYMENT', entityId: plan.id, entityLabel: deployTarget, newValues: { ticketId: req.params.ticketId, deployType, plannedAt } });
    res.status(201).json(plan);
  } catch (err) { next(err); }
};

const toggleChecklistItem = async (req, res, next) => {
  try {
    const item = await prisma.deployChecklistItem.findUnique({ where: { id: req.params.itemId } });
    if (!item) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });

    const updated = await prisma.deployChecklistItem.update({
      where: { id: item.id },
      data: {
        isChecked: !item.isChecked,
        checkedById: !item.isChecked ? req.user.id : null,
        checkedAt: !item.isChecked ? new Date() : null,
        note: req.body.note || item.note,
      },
      include: { checkedBy: { select: { id: true, name: true } } },
    });
    audit.log({ ...audit.fromReq(req), action: 'TOGGLE_CHECKLIST', entityType: 'DEPLOYMENT', entityId: item.deploymentPlanId, newValues: { itemId: item.id, itemText: item.itemText, isChecked: !item.isChecked } });
    res.json(updated);
  } catch (err) { next(err); }
};

const setReady = async (req, res, next) => {
  try {
    const plan = await prisma.deploymentPlan.findUnique({
      where: { ticketId: req.params.ticketId },
      include: { checklist: true },
    });
    if (!plan) return res.status(404).json({ error: '이관 계획서가 없습니다.' });

    const uncheckedMandatory = plan.checklist.filter(i => i.isMandatory && !i.isChecked);
    if (uncheckedMandatory.length > 0) {
      return res.status(400).json({
        error: `필수 체크리스트 ${uncheckedMandatory.length}건이 미확인입니다.`,
        items: uncheckedMandatory.map(i => i.itemText),
      });
    }

    const updated = await prisma.deploymentPlan.update({
      where: { id: plan.id },
      data: { status: 'READY' },
    });
    audit.log({ ...audit.fromReq(req), action: 'SET_DEPLOYMENT_READY', entityType: 'DEPLOYMENT', entityId: plan.id, entityLabel: plan.deployTarget });
    res.json(updated);
  } catch (err) { next(err); }
};

const recordResult = async (req, res, next) => {
  try {
    const { status, resultNote, rollbackNote } = req.body;
    if (!status || !['SUCCESS', 'PARTIAL', 'FAILED', 'ROLLBACK'].includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 결과 상태입니다.' });
    }

    const plan = await prisma.deploymentPlan.findUnique({ where: { ticketId: req.params.ticketId } });
    if (!plan) return res.status(404).json({ error: '이관 계획서가 없습니다.' });
    if (plan.status !== 'READY') return res.status(400).json({ error: '이관 준비(READY) 상태에서만 결과를 기록할 수 있습니다.' });

    const deployStatus = status === 'SUCCESS' || status === 'PARTIAL' ? 'DEPLOYED'
      : status === 'ROLLBACK' ? 'ROLLBACK' : 'FAILED';

    const [result] = await prisma.$transaction([
      prisma.deploymentResult.create({
        data: { deploymentPlanId: plan.id, status, deployedById: req.user.id, resultNote, rollbackNote },
        include: { deployedBy: { select: { id: true, name: true } } },
      }),
      prisma.deploymentPlan.update({ where: { id: plan.id }, data: { status: deployStatus } }),
    ]);

    audit.log({ ...audit.fromReq(req), action: 'RECORD_DEPLOYMENT_RESULT', entityType: 'DEPLOYMENT', entityId: plan.id, entityLabel: plan.deployTarget, newValues: { status, resultNote, rollbackNote } });
    res.status(201).json(result);
  } catch (err) { next(err); }
};

const getAllDeployments = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? { status } : {};
    const plans = await prisma.deploymentPlan.findMany({
      where,
      include: {
        ticket: { select: { id: true, ticketNumber: true, title: true } },
        createdBy: { select: { id: true, name: true } },
        result: { select: { status: true, deployedAt: true } },
        _count: { select: { checklist: true } },
      },
      orderBy: { plannedAt: 'asc' },
    });
    res.json(plans);
  } catch (err) { next(err); }
};

module.exports = { getDeployment, createDeployment, toggleChecklistItem, setReady, recordResult, getAllDeployments };
