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
    prisma.department.upsert({ where: { code: 'AUTO' }, update: {}, create: { name: '오토금융부', code: 'AUTO' } }),
  ]);
  const [itDept, dbDept, hrDept, finDept, opsDept, autoDept] = departments;

  // 사용자 생성
  const hash = (pw) => bcrypt.hash(pw, 12);
  const rnd = () => String(Math.floor(Math.random() * 10));
  const [admin, mgr, apr1, apr2, dev1, dev2, usr1, usr2,
         dev3, dev4, dev5, dev6, dev7, dev8] = await Promise.all([
    prisma.user.upsert({
      where: { employeeId: 'ADMIN001' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'ADMIN001', name: '시스템관리자', email: 'admin@company.com', passwordHash: await hash('1234'), role: 'ADMIN', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'MGR001' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'MGR001', name: 'IT책임자', email: 'manager@company.com', passwordHash: await hash('1234'), role: 'MANAGER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'APR001' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'APR001', name: 'IT팀장', email: 'approver@company.com', passwordHash: await hash('1234'), role: 'APPROVER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'APR002' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'APR002', name: 'DB팀장', email: 'db.approver@company.com', passwordHash: await hash('1234'), role: 'APPROVER', departmentId: dbDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV001' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'DEV001', name: '김개발', email: 'dev1@company.com', passwordHash: await hash('1234'), role: 'DEVELOPER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV002' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'DEV002', name: '이개발', email: 'dev2@company.com', passwordHash: await hash('1234'), role: 'DEVELOPER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'USR001' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'USR001', name: '박사원', email: 'user1@company.com', passwordHash: await hash('1234'), role: 'USER', departmentId: hrDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'USR002' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'USR002', name: '최직원', email: 'user2@company.com', passwordHash: await hash('1234'), role: 'USER', departmentId: hrDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'AUTO001' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'AUTO001', name: '오토사원', email: 'auto1@company.com', passwordHash: await hash('1234'), role: 'USER', departmentId: autoDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'AUTO002' }, update: { passwordHash: await hash('1234'), memo: rnd() },
      create: { employeeId: 'AUTO002', name: '오토팀장', email: 'auto2@company.com', passwordHash: await hash('1234'), role: 'APPROVER', departmentId: autoDept.id, memo: rnd() },
    }),
    // IT BA 추가 (도메인별 담당자)
    prisma.user.upsert({
      where: { employeeId: 'DEV003' }, update: { memo: rnd() },
      create: { employeeId: 'DEV003', name: '정금융', email: 'dev3@company.com', passwordHash: await hash('Dev1234!'), role: 'DEVELOPER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV004' }, update: { memo: rnd() },
      create: { employeeId: 'DEV004', name: '한오토', email: 'dev4@company.com', passwordHash: await hash('Dev1234!'), role: 'DEVELOPER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV005' }, update: { memo: rnd() },
      create: { employeeId: 'DEV005', name: '오거래', email: 'dev5@company.com', passwordHash: await hash('Dev1234!'), role: 'DEVELOPER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV006' }, update: { memo: rnd() },
      create: { employeeId: 'DEV006', name: '권데이터', email: 'dev6@company.com', passwordHash: await hash('Dev1234!'), role: 'DEVELOPER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV007' }, update: { memo: rnd() },
      create: { employeeId: 'DEV007', name: '임채널', email: 'dev7@company.com', passwordHash: await hash('Dev1234!'), role: 'DEVELOPER', departmentId: itDept.id, memo: rnd() },
    }),
    prisma.user.upsert({
      where: { employeeId: 'DEV008' }, update: { memo: rnd() },
      create: { employeeId: 'DEV008', name: '강경영', email: 'dev8@company.com', passwordHash: await hash('Dev1234!'), role: 'DEVELOPER', departmentId: itDept.id, memo: rnd() },
    }),
  ]);

  // 티켓 유형 및 워크플로우 단계 생성
  // 1. 통합전산개발요청
  const devType = await prisma.ticketType.upsert({
    where: { code: 'DEV' }, update: {},
    create: { code: 'DEV', name: '통합전산개발요청', description: '프로그램 개발 요청' },
  });
  for (const s of [
    { stageOrder: 1, name: '요구사항 등록', requiredRole: 'USER',      actionType: 'SUBMIT',  isRequesterStage: true,  slaTargetHours: 48 },
    { stageOrder: 2, name: '요구사항 검토', requiredRole: 'DEVELOPER', actionType: 'APPROVE', isRequesterStage: false, slaTargetHours: 24 },
    { stageOrder: 3, name: '병합 결재',     requiredRole: 'MANAGER',   actionType: 'PARALLEL_APPROVE', isRequesterStage: false },
    { stageOrder: 4, name: '개발 및 테스트', requiredRole: 'DEVELOPER', actionType: 'COMBINED_WORK', isRequesterStage: false },
    { stageOrder: 5, name: '책임자 검수',   requiredRole: 'MANAGER',   actionType: 'PARALLEL_APPROVE', isRequesterStage: false },
    { stageOrder: 6, name: '배포',          requiredRole: 'DEVELOPER', actionType: 'WORK',    isRequesterStage: false, slaTargetHours: 8 },
    { stageOrder: 7, name: '배포결과 승인', requiredRole: 'MANAGER',   actionType: 'APPROVE', isRequesterStage: false, slaTargetHours: 24 },
    { stageOrder: 8, name: '완료 확인',     requiredRole: 'USER',      actionType: 'CONFIRM', isRequesterStage: true,  slaTargetHours: 48 },
  ]) {
    await prisma.workflowStage.upsert({
      where: { ticketTypeId_stageOrder: { ticketTypeId: devType.id, stageOrder: s.stageOrder } },
      update: {
        name: s.name,
        requiredRole: s.requiredRole,
        actionType: s.actionType,
        isRequesterStage: s.isRequesterStage ?? false,
        slaTargetHours: s.slaTargetHours ?? null,
      },
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

  // 도메인-IT BA 매핑 생성
  const domainMappings = [
    // 금융 도메인 → 정금융(DEV003)
    { domain: '개인금융',     itbaId: dev3.id },
    { domain: '기업금융',     itbaId: dev3.id },
    { domain: '투자금융',     itbaId: dev3.id },
    { domain: '주택금융',     itbaId: dev3.id },
    { domain: '스탁론',       itbaId: dev3.id },
    // 오토/리스 도메인 → 한오토(DEV004)
    { domain: '오토리스',     itbaId: dev4.id },
    { domain: '렌터카',       itbaId: dev4.id },
    { domain: '승용',         itbaId: dev4.id },
    { domain: '산업재',       itbaId: dev4.id },
    { domain: '일반리스',     itbaId: dev4.id },
    // 거래/운영 도메인 → 오거래(DEV005)
    { domain: '청구수납',     itbaId: dev5.id },
    { domain: '채권관리',     itbaId: dev5.id },
    { domain: '계약사후',     itbaId: dev5.id },
    { domain: '상품운영기준', itbaId: dev5.id },
    // 데이터/분석 도메인 → 권데이터(DEV006)
    { domain: '리스크',       itbaId: dev6.id },
    { domain: '정보분석',     itbaId: dev6.id },
    { domain: '신용조회',     itbaId: dev6.id },
    { domain: '대외',         itbaId: dev6.id },
    { domain: '마이데이터',   itbaId: dev6.id },
    // 채널/고객 도메인 → 임채널(DEV007)
    { domain: '콜센터',       itbaId: dev7.id },
    { domain: '고객',         itbaId: dev7.id },
    { domain: '파트너',       itbaId: dev7.id },
    { domain: '시너지',       itbaId: dev7.id },
    // 경영관리 도메인 → 강경영(DEV008)
    { domain: '통합결재',     itbaId: dev8.id },
    { domain: '회계',         itbaId: dev8.id },
    { domain: '자금',         itbaId: dev8.id },
    { domain: '결산',         itbaId: dev8.id },
    { domain: '예산',         itbaId: dev8.id },
    { domain: '총무',         itbaId: dev8.id },
    { domain: '내부통제',     itbaId: dev8.id },
  ];
  for (const m of domainMappings) {
    await prisma.domainItbaMapping.upsert({
      where: { domain: m.domain },
      update: { itbaId: m.itbaId },
      create: m,
    });
  }

  console.log('✅ 시드 데이터 생성 완료!');
  console.log('');
  console.log('테스트 계정 (임시 개발용 비밀번호: 1234):');
  console.log('  관리자:    ADMIN001 (시스템관리자)');
  console.log('  책임자:    MGR001   (IT책임자)');
  console.log('  결재자:    APR001   (IT팀장), APR002 (DB팀장), AUTO002 (오토팀장)');
  console.log('  개발자:    DEV001   (김개발), DEV002 (이개발)');
  console.log('  사용자:    USR001   (박사원), USR002 (최직원), AUTO001 (오토사원)');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
