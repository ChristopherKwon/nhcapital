const Anthropic = require('@anthropic-ai/sdk');
const prisma = require('../utils/prisma');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const EMBEDDING_DIM = 1536;

// Claude API로 텍스트 임베딩 생성 (text-embedding-3-small 호환 방식)
// Anthropic은 자체 임베딩 API가 없으므로 voyage-3-lite 모델을 voyageai 또는
// claude 자체 방식 대신, 여기서는 간결한 float 벡터를 직접 생성하는 방식 사용
// 운영 전환 시 Ollama(nomic-embed-text)로 교체: generateEmbedding만 수정
async function generateEmbedding(text) {
  // Anthropic은 임베딩 API를 별도 제공하지 않아 Voyage AI 사용
  // ANTHROPIC_API_KEY가 없거나 개발 중일 경우 zero 벡터 반환 (유사 검색 비활성)
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
    return new Array(EMBEDDING_DIM).fill(0);
  }

  try {
    // claude-haiku로 텍스트 핵심 키워드를 추출 후 결정론적 해시 기반 벡터 생성
    // 실제 운영에서는 Ollama nomic-embed-text 또는 Voyage AI 임베딩으로 교체 권장
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `다음 텍스트의 핵심 의미를 나타내는 키워드를 최대 20개 추출해주세요. JSON 배열로만 답하세요.\n\n${text}`
      }]
    });

    const keywords = JSON.parse(response.content[0].text);
    return keywordsToVector(keywords, EMBEDDING_DIM);
  } catch {
    return keywordsToVector(text.split(/\s+/).slice(0, 20), EMBEDDING_DIM);
  }
}

// 키워드 배열을 결정론적 float 벡터로 변환
function keywordsToVector(keywords, dim) {
  const vec = new Array(dim).fill(0);
  for (const kw of keywords) {
    let hash = 5381;
    for (let i = 0; i < kw.length; i++) {
      hash = ((hash << 5) + hash) + kw.charCodeAt(i);
      hash = hash & hash;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
  }
  return normalizeVector(vec);
}

function normalizeVector(vec) {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map(v => v / magnitude);
}

// 티켓용 검색 텍스트 조합
function buildTicketSearchText(data) {
  return [
    data.title,
    data.description,
    data.businessDomain,
    data.subCategory,
    data.targetSystem,
  ].filter(Boolean).join(' ');
}

// 유사 티켓 검색 (pgvector 코사인 유사도)
async function findSimilarTickets({ text, excludeTicketId = null, limit = 5 }) {
  const embedding = await generateEmbedding(text);
  const vectorStr = `[${embedding.join(',')}]`;

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      t.id,
      t."ticketNumber",
      t.title,
      t.status,
      t."businessDomain",
      t."subCategory",
      t."targetSystem",
      t."finalDifficulty",
      t."aiEstimatedDifficulty",
      t."aiEstimatedDays",
      t."createdAt",
      u.name            AS "requesterName",
      tt.name           AS "ticketTypeName",
      1 - (t.embedding <=> $1::vector) AS similarity
    FROM tickets t
    JOIN users u  ON u.id = t."requesterId"
    JOIN ticket_types tt ON tt.id = t."ticketTypeId"
    WHERE t.embedding IS NOT NULL
      ${excludeTicketId ? `AND t.id != '${excludeTicketId}'` : ''}
    ORDER BY t.embedding <=> $1::vector
    LIMIT $2
  `, vectorStr, limit);

  return rows.filter(r => r.similarity > 0.3);
}

// AI 난이도 판정
async function estimateDifficulty({ ticketData, similarTickets = [] }) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
    return { difficulty: 'MEDIUM', reason: 'AI 키 미설정 — 기본값 적용', estimatedDays: '3~5일' };
  }

  const similarContext = similarTickets.length > 0
    ? `\n\n[유사 과거 티켓]\n${similarTickets.slice(0, 3).map(t =>
        `- "${t.title}" / 난이도: ${t.finalDifficulty || t.aiEstimatedDifficulty || '미정'} / 예상: ${t.aiEstimatedDays || '-'}`
      ).join('\n')}`
    : '';

  const prompt = `당신은 IT 개발 난이도를 판정하는 전문가입니다.
다음 IT 개발 요청의 난이도를 판정해주세요.${similarContext}

[요청 정보]
- 제목: ${ticketData.title}
- 유형: ${ticketData.ticketTypeName || ''}
- 업무 도메인: ${ticketData.businessDomain || ''}
- 요청 구분: ${ticketData.subCategory || ''}
- 대상 시스템: ${ticketData.targetSystem || ''}
- 요청 배경: ${ticketData.why || ''}
- 사용자: ${ticketData.who || ''}
- 기대 효과: ${ticketData.benefit || ''}

다음 JSON 형식으로만 답하세요:
{
  "difficulty": "LOW | MEDIUM | HIGH | VERY_HIGH",
  "estimatedDays": "예: 1~2일 또는 2주 이상",
  "reason": "판단 근거 2~3문장"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text.trim();
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, ''));
    return {
      difficulty: ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].includes(json.difficulty) ? json.difficulty : 'MEDIUM',
      estimatedDays: json.estimatedDays || '미정',
      reason: json.reason || ''
    };
  } catch {
    return { difficulty: 'MEDIUM', reason: 'AI 판정 실패 — 기본값 적용', estimatedDays: '미정' };
  }
}

// 영향도 분석 데이터 기반 난이도 재계산
async function recalculateDifficulty({ ticketData, impactData, similarTickets = [] }) {
  // IT BA가 직접 override한 경우 AI 호출 없이 즉시 확정
  if (ticketData.itbaDifficultyOverride) {
    return {
      difficulty: ticketData.itbaDifficultyOverride,
      estimatedDays: ticketData.aiEstimatedDays || '미정',
      reason: 'IT BA 직접 판정',
    };
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
    return ruleBased(impactData, ticketData);
  }

  const impactSummary = impactData.length > 0
    ? impactData.map(i =>
        `- ${i.programType} / ${i.programName} / ${i.isNew ? '신규' : '수정'} / 영향도: ${i.impactLevel}`
      ).join('\n')
    : '(입력된 프로그램 없음)';

  const extIface = ticketData.externalInterfaceCount || '없음';
  const dbChange = ticketData.dbChangeRequired ? '있음' : '없음';
  const customerFacing = ticketData.isCustomerFacing ? '예 (홈페이지·제휴플랫폼 등 실시간 반영 필요)' : '아니오';

  const similarContext = similarTickets.length > 0
    ? `\n[유사 티켓 실적]\n${similarTickets.slice(0, 3).map(t =>
        `- "${t.title}": 최종난이도 ${t.finalDifficulty || '-'} / 실제기간 ${t.aiEstimatedDays || '-'}`
      ).join('\n')}`
    : '';

  const prompt = `당신은 IT 개발 난이도를 판정하는 전문가입니다.
IT BA가 분석한 영향도 데이터를 바탕으로 개발 난이도를 재판정해주세요.${similarContext}

[티켓] ${ticketData.title}
[AI 초기 판정] ${ticketData.aiEstimatedDifficulty || 'MEDIUM'}

[IT BA 분석 결과]
- 영향 프로그램 수: ${impactData.length}건
- 외부 인터페이스 연동: ${extIface}
- DB 구조 변경: ${dbChange}
- 대고객 서비스 여부: ${customerFacing} (대고객 서비스인 경우 실시간 배포 부담, 고객 영향 리스크, QA 범위 증가로 난이도를 한 단계 높게 판정하세요)

[영향 프로그램 목록]
${impactSummary}

JSON으로만 답하세요:
{
  "difficulty": "LOW | MEDIUM | HIGH | VERY_HIGH",
  "estimatedDays": "예: 3~5일",
  "reason": "판단 근거 2~3문장"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    const json = JSON.parse(response.content[0].text.trim().replace(/```json\n?|\n?```/g, ''));
    return {
      difficulty: ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'].includes(json.difficulty) ? json.difficulty : 'MEDIUM',
      estimatedDays: json.estimatedDays || '미정',
      reason: json.reason || ''
    };
  } catch {
    return ruleBased(impactData, ticketData);
  }
}

// AI 없을 때 규칙 기반 난이도 계산
function ruleBased(impactData = [], ticketData = {}) {
  let score = 0;
  const total = impactData.length;
  const highCount = impactData.filter(i => i.impactLevel === 'HIGH').length;
  const hasInterface = impactData.some(i => i.programType === 'INTERFACE');

  score += total;
  score += highCount * 2;
  if (hasInterface) score += 3;
  if (ticketData.dbChangeRequired) score += 2;
  if (ticketData.externalInterfaceCount === '2건 이상') score += 4;
  else if (ticketData.externalInterfaceCount === '1건') score += 2;
  if (ticketData.isCustomerFacing) score += 3;

  if (score >= 10) return { difficulty: 'VERY_HIGH', estimatedDays: '2주 이상', reason: '대규모 영향 범위 및 외부 연동 포함' };
  if (score >= 6)  return { difficulty: 'HIGH',      estimatedDays: '1~2주',   reason: '중간 이상 영향 범위' };
  if (score >= 3)  return { difficulty: 'MEDIUM',    estimatedDays: '3~5일',   reason: '소규모 영향 범위' };
  return { difficulty: 'LOW', estimatedDays: '1~2일', reason: '최소 영향 범위' };
}

// 요구사항 기반 테스트 케이스 자동 생성
async function generateTestCases({ ticketTitle, requirement }) {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
    return [];
  }

  const prompt = `당신은 IT 개발 프로젝트의 QA 전문가입니다. 아래 요구사항을 분석하여 테스트 케이스를 생성해주세요.

[티켓] ${ticketTitle}
[요구사항 제목] ${requirement.title}
[요구사항 설명] ${requirement.description || '(상세 설명 없음)'}

규칙:
- 정상 케이스, 경계값 케이스, 예외 케이스를 골고루 포함하여 3~5개 생성
- testSteps는 "1. ~\n2. ~\n3. ~" 형태의 번호 단계로 작성
- priority는 핵심 기능이면 HIGH, 일반이면 MEDIUM, 보조면 LOW

다음 JSON 배열 형식으로만 답하세요:
[
  {
    "title": "테스트 케이스 제목",
    "preconditions": "사전 조건 (없으면 null)",
    "testSteps": "1. 단계1\n2. 단계2\n3. 단계3",
    "expectedResult": "기대 결과",
    "priority": "HIGH | MEDIUM | LOW | CRITICAL"
  }
]`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content[0].text.trim().replace(/```json\n?|\n?```/g, '');
    const cases = JSON.parse(text);
    return Array.isArray(cases) ? cases : [];
  } catch {
    return [];
  }
}

module.exports = { generateEmbedding, buildTicketSearchText, findSimilarTickets, estimateDifficulty, recalculateDifficulty, generateTestCases };
