// src/utils/seed.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('시드 데이터 생성 중...');

  // 부서 생성
  const departments = await Promise.all([
    prisma.department.upsert({ where: { code: 'IT' }, update: {}, create: { name: 'IT개발팀', code: 'IT' } }),
    prisma.department.upsert({ where: { code: 'DB' }, update: {}, create: { name: 'DB관리팀', code: 'DB' } }),
    prisma.department.upsert({ where: { code: 'HR' }, update: {}, create: { name: '인사팀', code: 'HR' } }),
    prisma.department.upsert({ where: { code: 'FIN' }, update: {}, create: { name: '재무팀', code: 'FIN' } }),
    prisma.department.upsert({ where: { code: 'OPS' }, update: {}, create: { name: '운영팀', code: 'OPS' } }),
  ]);
  const [itDept, dbDept, hrDept] = departments;

  // 사용자 생성
  const hash = (pw) => bcrypt.hash(pw, 12);
  await Promise.all([
    prisma.user.upsert({
      where: { employeeId: 'ADMIN001' }, update: {},
      create: { employeeId: 'ADMIN001', name: '시스템관리자', email: 'admin@company.com', passwordHash: await hash('Admin1234!'), role: 'ADMIN', departmentId: itDept.id },
    }),
    prisma.user.upsert({
      where: { employeeId: 'MGR001' }, update: {},
      create: { employeeId: 'MGR001', name: 'IT책임자', email: 'manager@company.com', passwordHash: await hash('Manager1234!'), role: 'MANAGER', departmentId: itDept.id },
    }),
    prisma.user.upsert({
      where: { employeeId: 'APR001' }, update: {},
      create: { employeeId: 'APR001', name: 'IT팀장', email: 'approver@company.com', passwordHash: await hash('Approver1234!'), role: 'APPROVER', departmentId: itDept.id },
    }),
    prisma.user.upsert({
      where: { employeeId: 'APR002' }, update: {},
      create: { employeeId: 'APR002', name: 'DB팀장', email: 'db.approver@company.com', passwordHash: await hash('Approver1234!'), role: 'APPROVER', departmentId: dbDept.id },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV001' }, update: {},
      create: { employeeId: 'DEV001', name: '김개발', email: 'dev1@company.com', passwordHash: await hash('Dev1234!'), role: 'DEVELOPER', departmentId: itDept.id },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV002' }, update: {},
      create: { employeeId: 'DEV002', name: '이개발', email: 'dev2@company.com', passwordHash: await hash('Dev1234!'), role: 'DEVELOPER', departmentId: itDept.id },
    }),
    prisma.user.upsert({
      where: { employeeId: 'USR001' }, update: {},
      create: { employeeId: 'USR001', name: '박사원', email: 'user1@company.com', passwordHash: await hash('User1234!'), role: 'USER', departmentId: hrDept.id },
    }),
    prisma.user.upsert({
      where: { employeeId: 'USR002' }, update: {},
      create: { employeeId: 'USR002', name: '최직원', email: 'user2@company.com', passwordHash: await hash('User1234!'), role: 'USER', departmentId: hrDept.id },
    }),
  ]);

  // 티켓 유형 및 워크플로우 단계 생성
  // 1. 통합전산개발요청
  const devType = await prisma.ticketType.upsert({
    where: { code: 'DEV' }, update: {},
    create: { code: 'DEV', name: '통합전산개발요청', description: '프로그램 개발 요청' },
  });
  for (const s of [
    { stageOrder: 1,  name: '요청등록',             requiredRole: 'USER',      actionType: 'SUBMIT',  isRequesterStage: true },
    { stageOrder: 2,  name: '요청승인',             requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 3,  name: '영향도분석',           requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 48 },
    { stageOrder: 4,  name: '개발승인',             requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 5,  name: '개발진행',             requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 24 },
    { stageOrder: 6,  name: '개발',                 requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 240 },
    { stageOrder: 7,  name: '책임자개발검수',       requiredRole: 'MANAGER',   actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 8,  name: '테스트',               requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 48 },
    { stageOrder: 9,  name: '테스트결과승인',       requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 10, name: '개발완료 및 배포요청', requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 24 },
    { stageOrder: 11, name: '책임자배포검수',       requiredRole: 'MANAGER',   actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 12, name: '배포승인',             requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 13, name: '배포대상검토',         requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 8 },
    { stageOrder: 14, name: '배포',                 requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 8 },
    { stageOrder: 15, name: '배포결과승인',         requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 16, name: '요청자확인',           requiredRole: 'USER',      actionType: 'CONFIRM', isRequesterStage: true, slaTargetHours: 48 },
  ]) {
    await prisma.workflowStage.upsert({
      where: { ticketTypeId_stageOrder: { ticketTypeId: devType.id, stageOrder: s.stageOrder } },
      update: { slaTargetHours: s.slaTargetHours ?? null },
      create: { ticketTypeId: devType.id, ...s },
    });
  }

  // 2. 자료요청
  const dataReqType = await prisma.ticketType.upsert({
    where: { code: 'DATA' }, update: {},
    create: { code: 'DATA', name: '자료요청', description: '자료 조회 및 추출 요청' },
  });
  for (const s of [
    { stageOrder: 1, name: '요청등록', requiredRole: 'USER',      actionType: 'SUBMIT',  isRequesterStage: true },
    { stageOrder: 2, name: '요청승인', requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 3, name: '접수',     requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 8 },
    { stageOrder: 4, name: '처리',     requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 48 },
    { stageOrder: 5, name: '검수',     requiredRole: 'USER',      actionType: 'CONFIRM', isRequesterStage: true, slaTargetHours: 24 },
    { stageOrder: 6, name: '검수확인', requiredRole: 'USER',      actionType: 'CONFIRM', isRequesterStage: true, slaTargetHours: 24 },
  ]) {
    await prisma.workflowStage.upsert({
      where: { ticketTypeId_stageOrder: { ticketTypeId: dataReqType.id, stageOrder: s.stageOrder } },
      update: { slaTargetHours: s.slaTargetHours ?? null },
      create: { ticketTypeId: dataReqType.id, ...s },
    });
  }

  // 3. 자료수정 (원장변경) — DB팀 필수 합의
  const dataModType = await prisma.ticketType.upsert({
    where: { code: 'DATAMOD' }, update: {},
    create: { code: 'DATAMOD', name: '자료수정', description: '원장 데이터 변경 요청' },
  });
  for (const s of [
    { stageOrder: 1, name: '요청등록',  requiredRole: 'USER',      actionType: 'SUBMIT',    isRequesterStage: true },
    { stageOrder: 2, name: '요청승인',  requiredRole: 'APPROVER',  actionType: 'APPROVE',   slaTargetHours: 24 },
    { stageOrder: 3, name: '확인(DB팀)', requiredRole: 'APPROVER', actionType: 'CONSENSUS', slaTargetHours: 24, requiredDepartmentId: dbDept.id },
    { stageOrder: 4, name: '접수',      requiredRole: 'DEVELOPER', actionType: 'WORK',      slaTargetHours: 8 },
    { stageOrder: 5, name: '승인',      requiredRole: 'APPROVER',  actionType: 'APPROVE',   slaTargetHours: 24 },
    { stageOrder: 6, name: '처리',      requiredRole: 'DEVELOPER', actionType: 'WORK',      slaTargetHours: 48 },
    { stageOrder: 7, name: '검수',      requiredRole: 'USER',      actionType: 'CONFIRM',   isRequesterStage: true, slaTargetHours: 24 },
    { stageOrder: 8, name: '검수확인',  requiredRole: 'USER',      actionType: 'CONFIRM',   isRequesterStage: true, slaTargetHours: 24 },
  ]) {
    await prisma.workflowStage.upsert({
      where: { ticketTypeId_stageOrder: { ticketTypeId: dataModType.id, stageOrder: s.stageOrder } },
      update: { slaTargetHours: s.slaTargetHours ?? null },
      create: { ticketTypeId: dataModType.id, ...s },
    });
  }

  // 4. 변경관리
  const changeType = await prisma.ticketType.upsert({
    where: { code: 'CHG' }, update: {},
    create: { code: 'CHG', name: '변경관리', description: '인프라 및 DB 변경 요청' },
  });
  for (const s of [
    { stageOrder: 1,  name: '요청등록',              requiredRole: 'USER',      actionType: 'SUBMIT',  isRequesterStage: true },
    { stageOrder: 2,  name: '요청승인',              requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 3,  name: '요청접수 및 분류',      requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 8 },
    { stageOrder: 4,  name: '작업접수 및 담당자지정', requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 8 },
    { stageOrder: 5,  name: '작업계획등록',          requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 48 },
    { stageOrder: 6,  name: '작업계획 검토',         requiredRole: 'MANAGER',   actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 7,  name: '작업계획 확인',         requiredRole: 'MANAGER',   actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 8,  name: '작업계획 검토 및 승인', requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 9,  name: '계획승인',              requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 10, name: '작업결과 등록',         requiredRole: 'DEVELOPER', actionType: 'WORK',    slaTargetHours: 48 },
    { stageOrder: 11, name: '작업결과 검토',         requiredRole: 'MANAGER',   actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 12, name: '작업결과 확인',         requiredRole: 'MANAGER',   actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 13, name: '작업결과 검토 및 승인', requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 14, name: '결과승인',              requiredRole: 'APPROVER',  actionType: 'APPROVE', slaTargetHours: 24 },
    { stageOrder: 15, name: '결과확인',              requiredRole: 'USER',      actionType: 'CONFIRM', isRequesterStage: true, slaTargetHours: 48 },
  ]) {
    await prisma.workflowStage.upsert({
      where: { ticketTypeId_stageOrder: { ticketTypeId: changeType.id, stageOrder: s.stageOrder } },
      update: { slaTargetHours: s.slaTargetHours ?? null },
      create: { ticketTypeId: changeType.id, ...s },
    });
  }

  console.log('✅ 시드 데이터 생성 완료!');
  console.log('');
  console.log('테스트 계정:');
  console.log('  관리자:  ADMIN001 / Admin1234!');
  console.log('  책임자:  MGR001   / Manager1234!');
  console.log('  결재자:  APR001   / Approver1234!');
  console.log('  개발자:  DEV001   / Dev1234!');
  console.log('  사용자:  USR001   / User1234!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
