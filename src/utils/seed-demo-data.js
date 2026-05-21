require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const uploadPath = path.resolve(process.cwd(), process.env.UPLOAD_PATH || 'uploads');

function daysAgo(days, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function daysLater(days, hour = 18) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function ensureUploadFile(filename, content) {
  fs.mkdirSync(uploadPath, { recursive: true });
  const fullPath = path.join(uploadPath, filename);
  fs.writeFileSync(fullPath, content, 'utf8');
  return {
    filename,
    size: Buffer.byteLength(content, 'utf8'),
    mimetype: 'text/plain',
  };
}

function annotationImage(label, accent) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
      <rect width="1200" height="720" fill="#f8fafc"/>
      <rect x="80" y="70" width="1040" height="90" rx="18" fill="${accent}" opacity="0.18"/>
      <rect x="80" y="190" width="1040" height="420" rx="24" fill="#ffffff" stroke="#cbd5e1" stroke-width="4"/>
      <rect x="130" y="250" width="320" height="42" rx="12" fill="${accent}" opacity="0.22"/>
      <rect x="130" y="320" width="760" height="28" rx="10" fill="#e2e8f0"/>
      <rect x="130" y="370" width="680" height="28" rx="10" fill="#e2e8f0"/>
      <rect x="130" y="470" width="220" height="64" rx="18" fill="${accent}" opacity="0.85"/>
      <text x="130" y="135" font-size="34" font-family="Arial, sans-serif" fill="#0f172a">${label}</text>
      <text x="165" y="510" font-size="28" font-family="Arial, sans-serif" fill="#ffffff">저장</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function cleanupDemoData() {
  const demoTickets = await prisma.ticket.findMany({
    where: { ticketNumber: { startsWith: 'DEMO-' } },
    select: { id: true },
  });

  if (demoTickets.length === 0) {
    return;
  }

  const ticketIds = demoTickets.map((ticket) => ticket.id);
  const requirements = await prisma.requirement.findMany({
    where: { ticketId: { in: ticketIds } },
    select: { id: true },
  });
  const requirementIds = requirements.map((item) => item.id);

  const testCases = await prisma.testCase.findMany({
    where: { ticketId: { in: ticketIds } },
    select: { id: true },
  });
  const testCaseIds = testCases.map((item) => item.id);

  const testResults = await prisma.testResult.findMany({
    where: { testCaseId: { in: testCaseIds } },
    select: { id: true },
  });
  const testResultIds = testResults.map((item) => item.id);

  const deploymentPlans = await prisma.deploymentPlan.findMany({
    where: { ticketId: { in: ticketIds } },
    select: { id: true },
  });
  const deploymentPlanIds = deploymentPlans.map((item) => item.id);

  const workLogs = await prisma.combinedWorkLog.findMany({
    where: { ticketId: { in: ticketIds } },
    select: { id: true },
  });
  const workLogIds = workLogs.map((item) => item.id);

  const deletions = [];

  deletions.push(prisma.notification.deleteMany({
    where: {
      OR: [
        { ticketId: { in: ticketIds } },
        { message: { contains: '[DEMO]' } },
      ],
    },
  }));

  deletions.push(prisma.ticketRelation.deleteMany({
    where: {
      OR: [
        { ticketId: { in: ticketIds } },
        { relatedTicketId: { in: ticketIds } },
      ],
    },
  }));

  deletions.push(prisma.ticketAttachment.deleteMany({ where: { ticketId: { in: ticketIds } } }));
  deletions.push(prisma.ticketComment.deleteMany({ where: { ticketId: { in: ticketIds } } }));
  deletions.push(prisma.ticketConsensus.deleteMany({ where: { ticketId: { in: ticketIds } } }));
  deletions.push(prisma.ticketDeveloper.deleteMany({ where: { ticketId: { in: ticketIds } } }));
  deletions.push(prisma.ticketWatcher.deleteMany({ where: { ticketId: { in: ticketIds } } }));
  deletions.push(prisma.programImpact.deleteMany({ where: { ticketId: { in: ticketIds } } }));
  deletions.push(prisma.parallelApproval.deleteMany({ where: { ticketId: { in: ticketIds } } }));
  deletions.push(prisma.collaborationConsensus.deleteMany({ where: { ticketId: { in: ticketIds } } }));

  if (workLogIds.length > 0) {
    deletions.push(prisma.combinedWorkAttachment.deleteMany({ where: { workLogId: { in: workLogIds } } }));
    deletions.push(prisma.combinedWorkLog.deleteMany({ where: { id: { in: workLogIds } } }));
  }

  if (requirementIds.length > 0) {
    deletions.push(prisma.requirementAnnotation.deleteMany({ where: { requirementId: { in: requirementIds } } }));
    deletions.push(prisma.requirementFile.deleteMany({ where: { requirementId: { in: requirementIds } } }));
    deletions.push(prisma.requirementComment.deleteMany({ where: { requirementId: { in: requirementIds } } }));
    deletions.push(prisma.requirementHistory.deleteMany({ where: { requirementId: { in: requirementIds } } }));
    deletions.push(prisma.requirement.deleteMany({ where: { id: { in: requirementIds } } }));
  }

  deletions.push(prisma.defect.deleteMany({ where: { ticketId: { in: ticketIds } } }));

  if (testResultIds.length > 0) {
    deletions.push(prisma.testResultAttachment.deleteMany({ where: { testResultId: { in: testResultIds } } }));
    deletions.push(prisma.testResult.deleteMany({ where: { id: { in: testResultIds } } }));
  }

  if (testCaseIds.length > 0) {
    deletions.push(prisma.testCase.deleteMany({ where: { id: { in: testCaseIds } } }));
  }

  if (deploymentPlanIds.length > 0) {
    deletions.push(prisma.deploymentResult.deleteMany({ where: { deploymentPlanId: { in: deploymentPlanIds } } }));
    deletions.push(prisma.deployChecklistItem.deleteMany({ where: { deploymentPlanId: { in: deploymentPlanIds } } }));
    deletions.push(prisma.deploymentPlan.deleteMany({ where: { id: { in: deploymentPlanIds } } }));
  }

  deletions.push(prisma.ticketStageHistory.deleteMany({ where: { ticketId: { in: ticketIds } } }));
  deletions.push(prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } }));

  await prisma.$transaction(deletions);
}

async function main() {
  console.log('데모 데이터 생성 중...');

  await cleanupDemoData();

  const users = await prisma.user.findMany({
    where: {
      employeeId: {
        in: ['ADMIN001', 'MGR001', 'APR001', 'APR002', 'DEV001', 'DEV002', 'USR001', 'USR002'],
      },
    },
    include: { department: true },
  });

  const usersByEmployeeId = Object.fromEntries(users.map((user) => [user.employeeId, user]));
  const requiredUsers = ['ADMIN001', 'MGR001', 'APR001', 'APR002', 'DEV001', 'DEV002', 'USR001', 'USR002'];
  for (const employeeId of requiredUsers) {
    if (!usersByEmployeeId[employeeId]) {
      throw new Error(`필수 시드 사용자 누락: ${employeeId}`);
    }
  }

  const ticketTypes = await prisma.ticketType.findMany({
    include: { workflowStages: { orderBy: { stageOrder: 'asc' } } },
  });
  const ticketTypesByCode = Object.fromEntries(ticketTypes.map((type) => [type.code, type]));

  function stage(code, order) {
    const value = ticketTypesByCode[code]?.workflowStages.find((item) => item.stageOrder === order);
    if (!value) {
      throw new Error(`단계 없음: ${code} / ${order}`);
    }
    return value;
  }

  const ticketAttachmentFile = ensureUploadFile(
    'demo-dev-request-summary.txt',
    'DEMO-DEV-001 첨부 문서입니다.\n프로젝트 개요와 요청 배경을 요약해 둔 파일입니다.\n'
  );
  const requirementFile = ensureUploadFile(
    'demo-requirement-spec.txt',
    '요구사항 상세 명세 샘플입니다.\n변경 대상, 예외 처리, 테스트 포인트를 정리했습니다.\n'
  );
  const testEvidenceFile = ensureUploadFile(
    'demo-test-evidence.txt',
    '테스트 실행 증적 샘플입니다.\n실행 일시, 테스트 환경, 실패 스크린샷 위치 등을 적었습니다.\n'
  );
  const combinedWorkFile = ensureUploadFile(
    'demo-combined-work-notes.txt',
    '개발/테스트 통합 작업 기록 샘플입니다.\n개발 완료 시점과 테스트 확인 내역을 포함합니다.\n'
  );

  const devTicket = await prisma.ticket.create({
    data: {
      ticketNumber: 'DEMO-DEV-001',
      ticketTypeId: ticketTypesByCode.DEV.id,
      title: '모바일 리스 계약조회 화면 개선',
      description: '고객이 계약 진행 상태와 제출 서류를 한 화면에서 볼 수 있도록 UI를 개선하는 요청입니다.',
      requesterId: usersByEmployeeId.USR001.id,
      assigneeId: usersByEmployeeId.DEV001.id,
      currentStageId: stage('DEV', 8).id,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: daysLater(9),
      subCategory: '프로세스 개선',
      targetSystem: 'NHCIS',
      businessDomain: '개인금융',
      itBaId: usersByEmployeeId.DEV001.id,
      managerId: usersByEmployeeId.MGR001.id,
      aiEstimatedDifficulty: 'HIGH',
      aiEstimatedDays: '5~7일',
      aiDifficultyReason: '고객 접점 화면과 후선 상태 연동이 함께 필요한 건입니다.',
      finalDifficulty: 'HIGH',
      externalInterfaceCount: '1건',
      dbChangeRequired: true,
      itbaDifficultyOverride: null,
      isCustomerFacing: true,
      createdAt: daysAgo(12, 10),
      updatedAt: daysAgo(1, 15),
    },
  });

  const dataModTicket = await prisma.ticket.create({
    data: {
      ticketNumber: 'DEMO-DATAMOD-001',
      ticketTypeId: ticketTypesByCode.DATAMOD.id,
      title: '리스 수수료 기준 데이터 정정 요청',
      description: '특정 상품군의 수수료 기준 데이터가 잘못 적재되어 원장 데이터를 정정해야 하는 요청입니다.',
      requesterId: usersByEmployeeId.USR002.id,
      assigneeId: usersByEmployeeId.DEV002.id,
      currentStageId: stage('DATAMOD', 3).id,
      status: 'IN_PROGRESS',
      priority: 'CRITICAL',
      dueDate: daysLater(2),
      subCategory: '원장 정정',
      targetSystem: 'SAS',
      businessDomain: '재무',
      itBaId: usersByEmployeeId.DEV001.id,
      managerId: usersByEmployeeId.MGR001.id,
      aiEstimatedDifficulty: 'MEDIUM',
      aiEstimatedDays: '2~3일',
      aiDifficultyReason: '수정 범위는 좁지만 데이터 검증과 부서 합의가 필요한 건입니다.',
      finalDifficulty: 'MEDIUM',
      externalInterfaceCount: '없음',
      dbChangeRequired: true,
      itbaDifficultyOverride: 'HIGH',
      isCustomerFacing: false,
      createdAt: daysAgo(6, 11),
      updatedAt: daysAgo(0, 9),
    },
  });

  const chgTicket = await prisma.ticket.create({
    data: {
      ticketNumber: 'DEMO-CHG-001',
      ticketTypeId: ticketTypesByCode.CHG.id,
      title: '주말 배치 서버 JVM 옵션 변경',
      description: '배치 처리 지연 문제를 완화하기 위해 JVM 메모리 옵션과 스케줄 설정을 조정한 변경관리 건입니다.',
      requesterId: usersByEmployeeId.APR001.id,
      assigneeId: usersByEmployeeId.DEV002.id,
      currentStageId: stage('CHG', 15).id,
      status: 'COMPLETED',
      priority: 'MEDIUM',
      dueDate: daysAgo(1, 18),
      subCategory: 'S/W',
      targetSystem: 'NHCIS',
      businessDomain: '통합결재',
      itBaId: usersByEmployeeId.DEV001.id,
      managerId: usersByEmployeeId.MGR001.id,
      aiEstimatedDifficulty: 'MEDIUM',
      aiEstimatedDays: '3일',
      aiDifficultyReason: '인프라 영향과 롤백 계획이 필요한 변경 작업입니다.',
      finalDifficulty: 'MEDIUM',
      externalInterfaceCount: '없음',
      dbChangeRequired: false,
      isCustomerFacing: false,
      createdAt: daysAgo(18, 9),
      updatedAt: daysAgo(0, 8),
    },
  });

  const rejectedTicket = await prisma.ticket.create({
    data: {
      ticketNumber: 'DEMO-DEV-002',
      ticketTypeId: ticketTypesByCode.DEV.id,
      title: '사용자별 홈 화면 테마 자유 변경',
      description: '개인 선호에 따라 홈 화면 레이아웃과 컬러를 전면 커스터마이즈할 수 있게 해 달라는 요청입니다.',
      requesterId: usersByEmployeeId.USR002.id,
      assigneeId: usersByEmployeeId.APR001.id,
      currentStageId: stage('DEV', 2).id,
      status: 'REJECTED',
      priority: 'LOW',
      dueDate: daysAgo(3, 18),
      subCategory: '신규업무 개발',
      targetSystem: '홈페이지/앱',
      businessDomain: '고객',
      itBaId: usersByEmployeeId.DEV001.id,
      managerId: usersByEmployeeId.MGR001.id,
      createdAt: daysAgo(14, 13),
      updatedAt: daysAgo(10, 16),
    },
  });

  const dataTicket = await prisma.ticket.create({
    data: {
      ticketNumber: 'DEMO-DATA-001',
      ticketTypeId: ticketTypesByCode.DATA.id,
      title: '분기별 조기상환 현황 자료 요청',
      description: '영업기획 보고용으로 최근 4개 분기의 조기상환 추이 데이터를 추출해 달라는 요청입니다.',
      requesterId: usersByEmployeeId.USR001.id,
      assigneeId: usersByEmployeeId.DEV002.id,
      currentStageId: stage('DATA', 4).id,
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      dueDate: daysLater(4),
      subCategory: '자료 조회',
      targetSystem: 'SAS',
      businessDomain: '통계',
      managerId: usersByEmployeeId.MGR001.id,
      createdAt: daysAgo(4, 14),
      updatedAt: daysAgo(0, 11),
    },
  });

  await prisma.ticketDeveloper.createMany({
    data: [
      { ticketId: devTicket.id, userId: usersByEmployeeId.DEV001.id, assignedAt: daysAgo(11, 10) },
      { ticketId: devTicket.id, userId: usersByEmployeeId.DEV002.id, assignedAt: daysAgo(10, 10), completedAt: daysAgo(3, 17) },
      { ticketId: chgTicket.id, userId: usersByEmployeeId.DEV002.id, assignedAt: daysAgo(17, 9), completedAt: daysAgo(2, 16) },
      { ticketId: dataTicket.id, userId: usersByEmployeeId.DEV002.id, assignedAt: daysAgo(3, 10) },
    ],
  });

  await prisma.ticketWatcher.createMany({
    data: [
      { ticketId: devTicket.id, userId: usersByEmployeeId.MGR001.id, addedById: usersByEmployeeId.DEV001.id, createdAt: daysAgo(10, 9) },
      { ticketId: devTicket.id, userId: usersByEmployeeId.APR002.id, addedById: usersByEmployeeId.DEV001.id, createdAt: daysAgo(9, 9) },
      { ticketId: dataModTicket.id, userId: usersByEmployeeId.ADMIN001.id, addedById: usersByEmployeeId.DEV001.id, createdAt: daysAgo(5, 15) },
      { ticketId: chgTicket.id, userId: usersByEmployeeId.APR001.id, addedById: usersByEmployeeId.MGR001.id, createdAt: daysAgo(15, 10) },
    ],
  });

  await prisma.ticketConsensus.createMany({
    data: [
      {
        ticketId: dataModTicket.id,
        departmentId: usersByEmployeeId.APR002.departmentId,
        approverId: usersByEmployeeId.APR002.id,
        isMandatory: true,
        status: 'PENDING',
        comment: 'DB 팀 검토 대기 중',
        requestedAt: daysAgo(1, 13),
      },
      {
        ticketId: devTicket.id,
        departmentId: usersByEmployeeId.APR002.departmentId,
        approverId: usersByEmployeeId.APR002.id,
        isMandatory: false,
        status: 'APPROVED',
        comment: '외부 영향 범위 확인 완료',
        requestedAt: daysAgo(7, 10),
        respondedAt: daysAgo(7, 16),
      },
    ],
  });

  const stageHistories = [
    { ticketId: devTicket.id, stageId: stage('DEV', 1).id, actorId: usersByEmployeeId.USR001.id, action: 'COMPLETED', comment: '요청 등록', elapsedMinutes: 15, createdAt: daysAgo(12, 10) },
    { ticketId: devTicket.id, stageId: stage('DEV', 2).id, actorId: usersByEmployeeId.APR001.id, action: 'APPROVED', comment: '개발 진행 필요', elapsedMinutes: 40, createdAt: daysAgo(11, 11) },
    { ticketId: devTicket.id, stageId: stage('DEV', 3).id, actorId: usersByEmployeeId.DEV001.id, action: 'COMPLETED', comment: '영향도분석 및 범위 확정', elapsedMinutes: 180, createdAt: daysAgo(10, 15) },
    { ticketId: devTicket.id, stageId: stage('DEV', 4).id, actorId: usersByEmployeeId.APR001.id, action: 'APPROVED', comment: '개발 승인', elapsedMinutes: 35, createdAt: daysAgo(9, 10) },
    { ticketId: devTicket.id, stageId: stage('DEV', 5).id, actorId: usersByEmployeeId.DEV001.id, action: 'COMPLETED', comment: '상세 일정 계획 수립', elapsedMinutes: 120, createdAt: daysAgo(8, 14) },
    { ticketId: devTicket.id, stageId: stage('DEV', 6).id, actorId: usersByEmployeeId.DEV002.id, action: 'COMPLETED', comment: '개발 본 작업 1차 완료', elapsedMinutes: 960, createdAt: daysAgo(4, 18) },
    { ticketId: devTicket.id, stageId: stage('DEV', 7).id, actorId: usersByEmployeeId.MGR001.id, action: 'APPROVED', comment: '테스트 단계 진행 승인', elapsedMinutes: 60, createdAt: daysAgo(3, 11) },

    { ticketId: dataModTicket.id, stageId: stage('DATAMOD', 1).id, actorId: usersByEmployeeId.USR002.id, action: 'COMPLETED', comment: '데이터 정정 요청 등록', elapsedMinutes: 10, createdAt: daysAgo(6, 11) },
    { ticketId: dataModTicket.id, stageId: stage('DATAMOD', 2).id, actorId: usersByEmployeeId.APR001.id, action: 'APPROVED', comment: '긴급 처리 승인', elapsedMinutes: 25, createdAt: daysAgo(5, 9) },

    { ticketId: chgTicket.id, stageId: stage('CHG', 1).id, actorId: usersByEmployeeId.APR001.id, action: 'COMPLETED', comment: '변경 요청 등록', elapsedMinutes: 10, createdAt: daysAgo(18, 9) },
    { ticketId: chgTicket.id, stageId: stage('CHG', 2).id, actorId: usersByEmployeeId.MGR001.id, action: 'APPROVED', comment: '변경 승인', elapsedMinutes: 35, createdAt: daysAgo(17, 10) },
    { ticketId: chgTicket.id, stageId: stage('CHG', 5).id, actorId: usersByEmployeeId.DEV002.id, action: 'COMPLETED', comment: '작업계획 등록', elapsedMinutes: 150, createdAt: daysAgo(14, 14) },
    { ticketId: chgTicket.id, stageId: stage('CHG', 9).id, actorId: usersByEmployeeId.APR001.id, action: 'APPROVED', comment: '계획 승인', elapsedMinutes: 45, createdAt: daysAgo(12, 10) },
    { ticketId: chgTicket.id, stageId: stage('CHG', 14).id, actorId: usersByEmployeeId.DEV002.id, action: 'COMPLETED', comment: '배포 완료', elapsedMinutes: 90, createdAt: daysAgo(1, 6) },
    { ticketId: chgTicket.id, stageId: stage('CHG', 15).id, actorId: usersByEmployeeId.APR001.id, action: 'COMPLETED', comment: '결과 확인 완료', elapsedMinutes: 30, createdAt: daysAgo(0, 8) },

    { ticketId: rejectedTicket.id, stageId: stage('DEV', 1).id, actorId: usersByEmployeeId.USR002.id, action: 'COMPLETED', comment: '아이디어성 요청 등록', elapsedMinutes: 8, createdAt: daysAgo(14, 13) },
    { ticketId: rejectedTicket.id, stageId: stage('DEV', 2).id, actorId: usersByEmployeeId.APR001.id, action: 'REJECTED', comment: '업무 우선순위와 효과 대비 후순위 처리', elapsedMinutes: 15, createdAt: daysAgo(10, 16) },

    { ticketId: dataTicket.id, stageId: stage('DATA', 1).id, actorId: usersByEmployeeId.USR001.id, action: 'COMPLETED', comment: '자료 요청 등록', elapsedMinutes: 6, createdAt: daysAgo(4, 14) },
    { ticketId: dataTicket.id, stageId: stage('DATA', 2).id, actorId: usersByEmployeeId.APR001.id, action: 'APPROVED', comment: '보고 일정에 맞춰 우선 처리', elapsedMinutes: 20, createdAt: daysAgo(3, 9) },
    { ticketId: dataTicket.id, stageId: stage('DATA', 3).id, actorId: usersByEmployeeId.DEV002.id, action: 'COMPLETED', comment: '추출 기준 확정', elapsedMinutes: 45, createdAt: daysAgo(2, 11) },
  ];

  const createdStageHistories = [];
  for (const history of stageHistories) {
    const created = await prisma.ticketStageHistory.create({ data: history });
    createdStageHistories.push(created);
  }

  const devReviewHistory = createdStageHistories.find((item) => item.ticketId === devTicket.id && item.stageId === stage('DEV', 7).id);
  if (devReviewHistory) {
    await prisma.ticketAttachment.create({
      data: {
        ticketId: devTicket.id,
        stageHistoryId: devReviewHistory.id,
        fileName: '개발개요_리뷰.txt',
        filePath: ticketAttachmentFile.filename,
        fileSize: ticketAttachmentFile.size,
        mimeType: ticketAttachmentFile.mimetype,
        uploadedById: usersByEmployeeId.DEV001.id,
        createdAt: daysAgo(3, 11),
      },
    });
  }

  await prisma.ticketComment.createMany({
    data: [
      { ticketId: devTicket.id, userId: usersByEmployeeId.USR001.id, content: '이번 주 시현 때 고객 여정이 자연스럽게 보였으면 좋겠습니다.', createdAt: daysAgo(11, 14) },
      { ticketId: devTicket.id, userId: usersByEmployeeId.DEV001.id, content: '진행상태 타임라인과 제출 서류 영역을 분리해서 설계 중입니다.', createdAt: daysAgo(8, 16) },
      { ticketId: devTicket.id, userId: usersByEmployeeId.MGR001.id, content: '테스트 전 시나리오를 먼저 정리해 주세요.', createdAt: daysAgo(3, 12) },
      { ticketId: dataModTicket.id, userId: usersByEmployeeId.USR002.id, content: '오후 마감 전 반영 여부가 꼭 필요합니다.', createdAt: daysAgo(1, 14) },
      { ticketId: chgTicket.id, userId: usersByEmployeeId.DEV002.id, content: '배치 서버 메모리 옵션 변경 및 재기동 완료했습니다.', createdAt: daysAgo(1, 7) },
      { ticketId: dataTicket.id, userId: usersByEmployeeId.DEV002.id, content: '조기상환 기준 일자를 재확인하고 있습니다.', createdAt: daysAgo(0, 11) },
    ],
  });

  const mainRequirement = await prisma.requirement.create({
    data: {
      ticketId: devTicket.id,
      title: '계약 상태 요약 카드 제공',
      description: '계약번호, 진행 단계, 제출 서류 현황을 상단 카드 영역에 요약 표시합니다.',
      createdById: usersByEmployeeId.DEV001.id,
      version: 2,
      createdAt: daysAgo(10, 12),
      updatedAt: daysAgo(5, 9),
    },
  });

  const secondaryRequirement = await prisma.requirement.create({
    data: {
      ticketId: devTicket.id,
      title: '제출 서류 누락 경고 표시',
      description: '미제출 서류가 있으면 경고 배지를 표시하고 서류 업로드 화면으로 이동합니다.',
      createdById: usersByEmployeeId.DEV001.id,
      createdAt: daysAgo(9, 15),
      updatedAt: daysAgo(4, 9),
    },
  });

  const dataModRequirement = await prisma.requirement.create({
    data: {
      ticketId: dataModTicket.id,
      title: '수수료 기준 데이터 검증 및 반영',
      description: '정정 전후 값을 비교하고 검증 결과를 남긴 뒤 반영합니다.',
      createdById: usersByEmployeeId.DEV001.id,
      createdAt: daysAgo(5, 11),
      updatedAt: daysAgo(1, 9),
    },
  });

  await prisma.requirementHistory.create({
    data: {
      requirementId: mainRequirement.id,
      version: 1,
      title: '계약 상태 상단 요약',
      description: '계약 진행 단계만 노출하는 초기안입니다.',
      changedById: usersByEmployeeId.DEV001.id,
      changeNote: '서류 현황과 상태 배지를 함께 보여주는 방향으로 확대',
      changedAt: daysAgo(7, 14),
    },
  });

  await prisma.requirementAnnotation.createMany({
    data: [
      {
        requirementId: mainRequirement.id,
        imageData: annotationImage('계약 상태 요약 카드', '#2563eb'),
        shapes: [
          { type: 'rect', x: 122, y: 238, width: 340, height: 68, color: '#2563eb', strokeWidth: 3 },
          { type: 'text', x: 144, y: 230, text: '핵심 상태 영역', color: '#1d4ed8', fontSize: 26 },
        ],
        createdById: usersByEmployeeId.DEV001.id,
        createdAt: daysAgo(7, 11),
      },
      {
        requirementId: secondaryRequirement.id,
        imageData: annotationImage('제출 서류 누락 경고', '#f97316'),
        shapes: [
          { type: 'rect', x: 720, y: 458, width: 260, height: 92, color: '#ea580c', strokeWidth: 3 },
          { type: 'text', x: 746, y: 446, text: '경고 배지 위치', color: '#c2410c', fontSize: 26 },
        ],
        createdById: usersByEmployeeId.DEV002.id,
        createdAt: daysAgo(6, 10),
      },
    ],
  });

  await prisma.requirementFile.createMany({
    data: [
      {
        requirementId: mainRequirement.id,
        filename: requirementFile.filename,
        originalName: '모바일계약조회_요건정리.txt',
        mimetype: requirementFile.mimetype,
        size: requirementFile.size,
        uploadedById: usersByEmployeeId.DEV001.id,
        createdAt: daysAgo(6, 13),
      },
    ],
  });

  await prisma.requirementComment.createMany({
    data: [
      {
        requirementId: mainRequirement.id,
        content: '카드 내 상태 색상은 고객이 직관적으로 이해할 수 있게 단순화해 주세요.',
        createdById: usersByEmployeeId.USR001.id,
        createdAt: daysAgo(5, 15),
      },
      {
        requirementId: mainRequirement.id,
        content: '완료/대기/누락 세 상태로 우선 정리해 반영하겠습니다.',
        createdById: usersByEmployeeId.DEV001.id,
        createdAt: daysAgo(5, 16),
      },
      {
        requirementId: dataModRequirement.id,
        content: '정정 전후 값 비교표를 산출물에 포함해 주세요.',
        createdById: usersByEmployeeId.APR002.id,
        createdAt: daysAgo(1, 10),
      },
    ],
  });

  await prisma.programImpact.createMany({
    data: [
      {
        ticketId: devTicket.id,
        programType: 'SCREEN',
        programName: 'MOB_CONTRACT_STATUS',
        isNew: false,
        description: '모바일 계약조회 메인 화면 레이아웃 수정',
        impactLevel: 'HIGH',
        impactScope: '고객 노출 화면',
        createdById: usersByEmployeeId.DEV001.id,
        createdAt: daysAgo(10, 16),
      },
      {
        ticketId: devTicket.id,
        programType: 'INTERFACE',
        programName: 'IF_CONTRACT_DOC_STATUS',
        isNew: false,
        description: '제출 서류 상태 조회 API 연계',
        impactLevel: 'MEDIUM',
        impactScope: '모바일/백엔드 인터페이스',
        createdById: usersByEmployeeId.DEV001.id,
        createdAt: daysAgo(10, 17),
      },
      {
        ticketId: chgTicket.id,
        programType: 'MODULE',
        programName: 'BATCH_JVM_CONFIG',
        isNew: false,
        description: '배치 서버 JVM 옵션과 스케줄 설정 변경',
        impactLevel: 'MEDIUM',
        impactScope: '야간 배치 서버',
        createdById: usersByEmployeeId.DEV002.id,
        createdAt: daysAgo(15, 10),
      },
    ],
  });

  const testCasePass = await prisma.testCase.create({
    data: {
      ticketId: devTicket.id,
      title: '계약 상태 카드 노출 확인',
      preconditions: '테스트용 계약 건이 존재해야 함',
      testSteps: '1. 계약조회 화면 진입\n2. 상태 카드 영역 확인\n3. 계약 진행 상태 표시 확인',
      expectedResult: '상단 카드에 진행 상태와 제출 서류 현황이 정상 표시된다.',
      priority: 'HIGH',
      status: 'PASS',
      createdById: usersByEmployeeId.DEV001.id,
      createdAt: daysAgo(2, 10),
    },
  });

  const testCaseFail = await prisma.testCase.create({
    data: {
      ticketId: devTicket.id,
      title: '서류 누락 경고 클릭 이동 확인',
      preconditions: '누락 서류가 있는 계약 데이터 준비',
      testSteps: '1. 누락 서류가 있는 계약 조회\n2. 경고 배지 클릭\n3. 서류 제출 안내 화면 이동 확인',
      expectedResult: '경고 배지 클릭 시 서류 제출 안내 화면으로 이동한다.',
      priority: 'HIGH',
      status: 'FAIL',
      createdById: usersByEmployeeId.DEV001.id,
      createdAt: daysAgo(2, 11),
    },
  });

  const passResult = await prisma.testResult.create({
    data: {
      testCaseId: testCasePass.id,
      testerId: usersByEmployeeId.DEV002.id,
      status: 'PASS',
      actualResult: '상태 카드 노출 정상',
      comment: '실계약 샘플 3건 기준 정상 확인',
      executedAt: daysAgo(1, 10),
    },
  });

  const failResult = await prisma.testResult.create({
    data: {
      testCaseId: testCaseFail.id,
      testerId: usersByEmployeeId.DEV002.id,
      status: 'FAIL',
      actualResult: '경고 배지를 눌러도 상세 안내로 이동하지 않음',
      comment: '이벤트 연결 누락으로 보임',
      executedAt: daysAgo(1, 11),
    },
  });

  await prisma.testResultAttachment.createMany({
    data: [
      {
        testResultId: passResult.id,
        filename: testEvidenceFile.filename,
        originalName: '테스트증적_PASS.txt',
        mimetype: testEvidenceFile.mimetype,
        size: testEvidenceFile.size,
        createdAt: daysAgo(1, 10),
      },
      {
        testResultId: failResult.id,
        filename: testEvidenceFile.filename,
        originalName: '테스트증적_FAIL.txt',
        mimetype: testEvidenceFile.mimetype,
        size: testEvidenceFile.size,
        createdAt: daysAgo(1, 11),
      },
    ],
  });

  await prisma.defect.createMany({
    data: [
      {
        ticketId: devTicket.id,
        testResultId: failResult.id,
        title: '서류 누락 경고 클릭 시 상세 화면 이동 실패',
        description: '경고 배지 클릭 이벤트가 연결되지 않아 안내 페이지로 이동하지 않습니다.',
        severity: 'HIGH',
        status: 'OPEN',
        reporterId: usersByEmployeeId.DEV002.id,
        assigneeId: usersByEmployeeId.DEV001.id,
        createdAt: daysAgo(1, 12),
      },
      {
        ticketId: chgTicket.id,
        title: '배치 재기동 후 첫 실행 지연',
        description: '캐시 워밍업으로 첫 배치가 3분가량 지연되었으나 이후 정상화되었습니다.',
        severity: 'LOW',
        status: 'RESOLVED',
        reporterId: usersByEmployeeId.MGR001.id,
        assigneeId: usersByEmployeeId.DEV002.id,
        resolvedAt: daysAgo(0, 7),
        createdAt: daysAgo(1, 7),
      },
    ],
  });

  const deploymentPlan = await prisma.deploymentPlan.create({
    data: {
      ticketId: chgTicket.id,
      deployTarget: '주말 배치 서버 1군',
      deployType: 'JVM 옵션 변경',
      plannedAt: daysAgo(1, 4),
      description: '야간 배치 창구 시간 전에 JVM 메모리 옵션과 스케줄 설정을 반영합니다.',
      status: 'DEPLOYED',
      createdById: usersByEmployeeId.DEV002.id,
      createdAt: daysAgo(3, 15),
      updatedAt: daysAgo(0, 8),
    },
  });

  await prisma.deployChecklistItem.createMany({
    data: [
      { deploymentPlanId: deploymentPlan.id, category: '개발', itemText: '적용 스크립트 최종 검토', isMandatory: true, displayOrder: 1, isChecked: true, checkedById: usersByEmployeeId.DEV002.id, checkedAt: daysAgo(1, 2) },
      { deploymentPlanId: deploymentPlan.id, category: '테스트', itemText: '배치 사전 점검 완료', isMandatory: true, displayOrder: 2, isChecked: true, checkedById: usersByEmployeeId.MGR001.id, checkedAt: daysAgo(1, 2) },
      { deploymentPlanId: deploymentPlan.id, category: '계획', itemText: '롤백 절차 확인', isMandatory: true, displayOrder: 3, isChecked: true, checkedById: usersByEmployeeId.DEV002.id, checkedAt: daysAgo(1, 3) },
      { deploymentPlanId: deploymentPlan.id, category: '문서', itemText: '운영 공지 공유', isMandatory: false, displayOrder: 4, isChecked: true, checkedById: usersByEmployeeId.APR001.id, checkedAt: daysAgo(1, 3) },
    ],
  });

  await prisma.deploymentResult.create({
    data: {
      deploymentPlanId: deploymentPlan.id,
      status: 'SUCCESS',
      deployedAt: daysAgo(1, 6),
      deployedById: usersByEmployeeId.DEV002.id,
      resultNote: '메모리 옵션 반영 후 배치 수행 시간이 14% 개선되었습니다.',
    },
  });

  const combinedLog = await prisma.combinedWorkLog.create({
    data: {
      ticketId: devTicket.id,
      devCompletedAt: daysAgo(2, 18),
      testCompletedAt: null,
      createdAt: daysAgo(2, 18),
    },
  });

  await prisma.combinedWorkAttachment.create({
    data: {
      workLogId: combinedLog.id,
      type: 'DEV_NOTE',
      filename: combinedWorkFile.filename,
      originalName: '개발메모.txt',
      mimetype: combinedWorkFile.mimetype,
      size: combinedWorkFile.size,
      uploadedById: usersByEmployeeId.DEV001.id,
      createdAt: daysAgo(2, 18),
    },
  });

  await prisma.ticketRelation.createMany({
    data: [
      {
        ticketId: devTicket.id,
        relatedTicketId: dataModTicket.id,
        relationType: 'BLOCKED_BY',
        createdById: usersByEmployeeId.DEV001.id,
        createdAt: daysAgo(5, 16),
      },
      {
        ticketId: devTicket.id,
        relatedTicketId: chgTicket.id,
        relationType: 'RELATED_TO',
        createdById: usersByEmployeeId.MGR001.id,
        createdAt: daysAgo(2, 9),
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: usersByEmployeeId.USR001.id,
        ticketId: devTicket.id,
        type: 'STAGE_CHANGED',
        message: '[DEMO] DEMO-DEV-001 이(가) 테스트 단계로 이동했습니다.',
        isRead: false,
        createdAt: daysAgo(1, 12),
      },
      {
        userId: usersByEmployeeId.DEV001.id,
        ticketId: devTicket.id,
        type: 'COMMENT_ADDED',
        message: '[DEMO] 요청자가 요구사항 상세 코멘트를 남겼습니다.',
        isRead: false,
        createdAt: daysAgo(0, 10),
      },
      {
        userId: usersByEmployeeId.APR002.id,
        ticketId: dataModTicket.id,
        type: 'CONSENSUS_REQUESTED',
        message: '[DEMO] DEMO-DATAMOD-001 합의 요청이 도착했습니다.',
        isRead: false,
        createdAt: daysAgo(0, 9),
      },
      {
        userId: usersByEmployeeId.APR001.id,
        ticketId: chgTicket.id,
        type: 'TICKET_COMPLETED',
        message: '[DEMO] DEMO-CHG-001 배포 결과가 성공으로 등록되었습니다.',
        isRead: true,
        createdAt: daysAgo(0, 8),
      },
      {
        userId: usersByEmployeeId.ADMIN001.id,
        ticketId: null,
        type: 'APPROVAL_REQUESTED',
        message: '[DEMO] 관리자 점검용 샘플 데이터가 준비되었습니다.',
        isRead: false,
        createdAt: daysAgo(0, 9),
      },
    ],
  });

  console.log('데모 티켓 5건과 상세 연관 데이터 생성 완료');
  console.log(' - 진행중: 3건');
  console.log(' - 완료: 1건');
  console.log(' - 반려: 1건');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
