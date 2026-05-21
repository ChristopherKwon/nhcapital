// public/js/app.js
const API = '/api';
let currentUser = null;
let socket = null;
let currentPage = null;

// ── 유틸리티 ──────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white max-w-xs ${type === 'error' ? 'bg-red-500' : type === 'warn' ? 'bg-yellow-500' : 'bg-green-600'}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '오류가 발생했습니다.');
  return data;
}

async function uploadFile(ticketId, file) {
  const token = localStorage.getItem('token');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/tickets/${ticketId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '파일 업로드 실패');
  return data;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

const roleLabel     = { USER: '일반사용자', APPROVER: '결재자', DEVELOPER: '개발자', MANAGER: '책임자', ADMIN: '관리자' };
const statusLabel   = { IN_PROGRESS: '진행중', COMPLETED: '완료', REJECTED: '반려', CANCELLED: '취소', DRAFT: '임시저장' };
const priorityLabel = { LOW: '낮음', MEDIUM: '보통', HIGH: '높음', CRITICAL: '긴급' };
const priorityColor = { LOW: 'text-gray-500', MEDIUM: 'text-blue-600', HIGH: 'text-orange-500', CRITICAL: 'text-red-600' };
const relationLabel = { RELATED_TO: '연관', PARENT_OF: '상위', CHILD_OF: '하위', DUPLICATES: '중복', BLOCKED_BY: '블로킹' };

// ── 대화형 등록 상수 ──
const CHAT_DEV_SUBCATS    = ['상품개발','신규업무 개발','프로세스 개선','신용전략 변경','규제 대응','성능 개선','장애 대응','재개발'];
const CHAT_DEV_SYSTEMS    = ['NHCIS','콜센터','홈페이지/앱','SAS','기타'];
const CHAT_CHG_TYPES      = ['콜센터','DB','H/W','S/W','N/W','보안','기타'];
const CHAT_PRIORITIES     = [{v:'LOW',l:'낮음'},{v:'MEDIUM',l:'보통'},{v:'HIGH',l:'높음'},{v:'CRITICAL',l:'긴급'}];
const CHAT_TYPE_DESC      = { DEV:'시스템 개발 및 기능 구현', DATA:'데이터 조회 요청', DATAMOD:'데이터 수정 요청', CHG:'인프라·SW 변경 관리' };
const CHAT_BIZ_DOMAINS    = ['개인금융','기업금융','투자금융','오토리스','렌터카','승용','산업재','주택금융','일반리스','스탁론','콜센터','상품운영기준','청구수납','채권관리','계약사후','신용조회','대외','마이데이터','리스크','정보분석','내부통제','시너지','고객','파트너','통합결재','회계','자금','결산','예산','총무'];
const DIFFICULTY_LABEL    = { LOW:'낮음', MEDIUM:'보통', HIGH:'높음', VERY_HIGH:'매우 높음' };
const DIFFICULTY_COLOR    = { LOW:'text-green-600 bg-green-50', MEDIUM:'text-yellow-600 bg-amber-50', HIGH:'text-orange-600 bg-orange-50', VERY_HIGH:'text-red-600 bg-red-50' };
let chatData = {};

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatElapsed(minutes) {
  if (minutes == null) return '';
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}일 ${rh}시간` : `${d}일`;
}

// ── 인증 ──────────────────────────────────────────────────
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const employeeId = $('#login-employee-id').value.trim();
  const password = $('#login-password').value;
  const errEl = $('#login-error');
  errEl.classList.add('hidden');
  try {
    const data = await api('/auth/login', { method: 'POST', body: { employeeId, password } });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    initApp(data.user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

async function quickLogin(employeeId) {
  const errEl = $('#login-error');
  errEl.classList.add('hidden');
  try {
    const data = await api('/auth/login', { method: 'POST', body: { employeeId, password: '1234' } });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    initApp(data.user);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

$('#logout-btn').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (socket) socket.disconnect();
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
  currentUser = null;
});

// ── 앱 초기화 ─────────────────────────────────────────────
function initApp(user) {
  currentUser = user;
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-name').textContent = user.name;
  $('#user-role').textContent = roleLabel[user.role] || user.role;
  $('#user-avatar').textContent = user.name[0];

  if (['ADMIN', 'MANAGER'].includes(user.role)) {
    $('#admin-menu').classList.remove('hidden');
  }

  initSocket();
  loadNotifications();
  navigate('dashboard');
}

// ── Socket.io ─────────────────────────────────────────────
function initSocket() {
  const token = localStorage.getItem('token');
  socket = io({ auth: { token } });
  socket.on('notification', (notif) => {
    toast(notif.message);
    loadNotificationBadge();
    if (currentPage === 'notifications') loadNotifications();
  });
}

// ── 알림 ──────────────────────────────────────────────────
async function loadNotificationBadge() {
  try {
    const data = await api('/notifications/unread-count');
    const badge = $('#notification-badge');
    if (data.count > 0) {
      badge.textContent = data.count > 99 ? '99+' : data.count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch {}
}

async function loadNotifications() {
  try {
    const notifications = await api('/notifications');
    const list = $('#notification-list');
    if (!notifications.length) {
      list.innerHTML = '<div class="px-4 py-6 text-center text-gray-400 text-sm">알림이 없습니다.</div>';
      return;
    }
    list.innerHTML = notifications.map(n => `
      <div class="px-4 py-3 hover:bg-gray-50 cursor-pointer ${n.isRead ? 'opacity-60' : ''}" onclick="readNotification('${n.id}', '${n.ticketId || ''}')">
        <div class="text-sm ${n.isRead ? 'text-gray-500' : 'text-gray-800 font-medium'}">${n.message}</div>
        <div class="text-xs text-gray-400 mt-0.5">${formatDate(n.createdAt)}</div>
      </div>
    `).join('');
  } catch {}
}

async function readNotification(id, ticketId) {
  await api(`/notifications/${id}/read`, { method: 'PATCH' });
  loadNotificationBadge();
  loadNotifications();
  if (ticketId) { navigate('ticket-detail', { id: ticketId }); $('#notification-dropdown').classList.add('hidden'); }
}

$('#notification-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const dd = $('#notification-dropdown');
  dd.classList.toggle('hidden');
  if (!dd.classList.contains('hidden')) loadNotifications();
});

$('#read-all-btn').addEventListener('click', async () => {
  await api('/notifications/read-all', { method: 'PATCH' });
  loadNotificationBadge();
  loadNotifications();
});

document.addEventListener('click', () => $('#notification-dropdown').classList.add('hidden'));

// ── 라우팅 ────────────────────────────────────────────────
$$('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(link.dataset.page);
  });
});

function navigate(page, params = {}) {
  currentPage = page;
  $$('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));

  const pages = {
    'dashboard': renderDashboard,
    'tickets': renderTicketList,
    'create-ticket': renderCreateTicket,
    'ticket-detail': renderTicketDetail,
    'admin-dashboard': renderAdminDashboard,
    'admin-users': renderAdminUsers,
    'admin-defects': renderAdminDefects,
    'admin-deployments': renderAdminDeployments,
    'admin-audit': renderAdminAudit,
    'admin-domain-itba': renderAdminDomainItba,
  };

  const titles = {
    'dashboard': '대시보드', 'tickets': '티켓 목록', 'create-ticket': '티켓 등록',
    'ticket-detail': '티켓 상세', 'admin-dashboard': '현황 대시보드', 'admin-users': '사용자 관리',
    'admin-defects': '결함 관리',
    'admin-deployments': '이관 현황',
    'admin-audit': '감사 로그',
    'admin-domain-itba': '도메인-IT BA 매핑',
  };

  $('#page-title').textContent = titles[page] || '';
  if (pages[page]) pages[page](params);
}

// ── 대시보드 (일반) ───────────────────────────────────────
async function renderDashboard() {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm">불러오는 중...</div>';
  try {
    const [{ tickets: actionable }, { tickets: involved }] = await Promise.all([
      api('/tickets/actionable'),
      api('/tickets/involved'),
    ]);
    const myRequested = involved.filter(t => t.requesterId === currentUser.id);
    const inProgress  = involved.filter(t => t.status === 'IN_PROGRESS');
    const completed   = involved.filter(t => t.status === 'COMPLETED');

    el.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        ${summaryCard('내 요청 티켓', myRequested.length, 'blue')}
        ${summaryCard('처리 대기', actionable.length, 'yellow')}
        ${summaryCard('참여 완료', completed.length, 'green')}
      </div>
      ${actionable.length ? `
      <div class="bg-white rounded-xl border border-yellow-200 overflow-hidden mb-4">
        <div class="px-5 py-4 border-b border-yellow-100 bg-yellow-50">
          <h2 class="font-semibold text-yellow-800">지금 내가 처리해야 할 티켓 (${actionable.length}건)</h2>
        </div>
        ${ticketTable(actionable)}
      </div>` : ''}
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 class="font-semibold text-gray-800">내가 참여한 티켓 (${involved.length}건)</h2>
          <button onclick="navigate('tickets')" class="text-blue-600 text-sm hover:underline">전체 보기</button>
        </div>
        ${ticketTable(involved)}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="text-red-500">${err.message}</div>`;
  }
}

function summaryCard(label, value, color) {
  const colors = { blue: 'bg-blue-50 border-blue-200 text-blue-700', yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700', green: 'bg-green-50 border-green-200 text-green-700' };
  return `<div class="rounded-xl border p-5 ${colors[color]}">
    <div class="text-2xl font-bold">${value}</div>
    <div class="text-sm mt-1">${label}</div>
  </div>`;
}

// ── 티켓 목록 ─────────────────────────────────────────────
async function renderTicketList() {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm">불러오는 중...</div>';
  try {
    const { tickets, total } = await api('/tickets?limit=50');
    el.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <span class="text-sm text-gray-500">총 ${total}건</span>
          <button onclick="navigate('create-ticket')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg transition">+ 티켓 등록</button>
        </div>
        ${ticketTable(tickets)}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="text-red-500">${err.message}</div>`;
  }
}

function ticketTable(tickets) {
  if (!tickets.length) return '<div class="px-5 py-10 text-center text-gray-400">티켓이 없습니다.</div>';
  return `<div class="overflow-x-auto"><table class="w-full text-sm">
    <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
      <tr>
        <th class="px-4 py-3 text-left">번호</th>
        <th class="px-4 py-3 text-left">유형</th>
        <th class="px-4 py-3 text-left">제목</th>
        <th class="px-4 py-3 text-left">현재 단계</th>
        <th class="px-4 py-3 text-left">상태</th>
        <th class="px-4 py-3 text-left">요청자</th>
        <th class="px-4 py-3 text-left">등록일</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100">
      ${tickets.map(t => `
        <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('ticket-detail', {id:'${t.id}'})">
          <td class="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">${t.ticketNumber}</td>
          <td class="px-4 py-3 whitespace-nowrap"><span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">${t.ticketType?.name || '-'}</span></td>
          <td class="px-4 py-3 font-medium max-w-xs truncate">${t.title}</td>
          <td class="px-4 py-3 text-gray-500 whitespace-nowrap">${t.currentStage?.name || '-'}</td>
          <td class="px-4 py-3 whitespace-nowrap"><span class="stage-badge status-${t.status}">${statusLabel[t.status]}</span></td>
          <td class="px-4 py-3 whitespace-nowrap">${t.requester?.name || '-'}</td>
          <td class="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">${formatDate(t.createdAt)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

// ── 대화형 티켓 등록 ─────────────────────────────────────────

function chatBuildSteps(typeCode) {
  const base = [
    { id:'businessDomain', type:'chips',    q:'어떤 업무 도메인의 요청인가요?',                                                    field:'businessDomain', opts:CHAT_BIZ_DOMAINS },
    { id:'title',          type:'text',     q:'요청 제목을 간단히 알려주세요.',                                                    field:'title',   ph:'예) 오토리스 화물차 취득세 적용 변경 요청' },
    { id:'why',            type:'textarea', q:'요청 배경을 설명해주세요.\n현재 문제점과 개선 후 기대 효과를 함께 적어주세요.',      field:'why',     ph:'예) 현재 화물차 취득세가 수동 입력 → 자동 계산 적용으로 오류 감소 및 업무 시간 단축 기대' },
    { id:'regulation',     type:'chips',    q:'법령·규제·공문 등 근거가 있는 요청인가요?',                                        field:'regulation', opts:['법령·규제 대응', '내부 기준 변경', '공문·지시', '해당 없음'], defaultVal:'해당 없음' },
  ];
  const devExtra = [
    { id:'subCategory',  type:'chips', q:'요청 구분을 선택해주세요.',          field:'subCategory',  opts:CHAT_DEV_SUBCATS },
    { id:'targetSystem', type:'chips', q:'개발 요청 대상 시스템은 무엇인가요?', field:'targetSystem', opts:CHAT_DEV_SYSTEMS },
  ];
  const chgExtra = [
    { id:'subCategory', type:'chips', q:'변경 상세유형을 선택해주세요.', field:'subCategory', opts:CHAT_CHG_TYPES },
  ];
  const final = [
    { id:'dueDate',  type:'date',  q:'완료 희망일이 있으신가요?', field:'dueDate', skippable:true, skipLabel:'없음' },
    { id:'itBa',     type:'user_search', q:'IT BA를 지정해주세요. (영향도 분석 담당자 필수 지정)', endpoint:'/common/users/it-ba', skippable:false },
    { id:'consensus', type:'consensus',  q:'합의가 필요한 분이 있나요? (선택사항)', skippable:true, skipLabel:'합의 불필요' },
    { id:'requirements', type:'requirements', q:'요구사항을 입력해주세요.\n최소 1개 이상 등록해야 티켓을 제출할 수 있습니다.' },
    { id:'summary',  type:'summary', q:'아래 내용으로 티켓을 등록할게요. 확인해주세요.' },
  ];
  const extra = typeCode==='DEV' ? devExtra : typeCode==='CHG' ? chgExtra : [];
  return [...base, ...extra, ...final];
}

async function renderCreateTicket() {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm p-6">불러오는 중...</div>';
  chatData = { ticketTypes: [], steps: [], currentStep: 0, answers: {}, itBa: null, consensusApprovers: [], linkedTickets: [], requirements: [], simTimer: null };
  try {
    chatData.ticketTypes = await api('/common/ticket-types');
  } catch (err) {
    el.innerHTML = `<div class="text-red-500 p-6">${err.message}</div>`; return;
  }

  el.innerHTML = `
    <div class="max-w-4xl mx-auto flex gap-5 pb-8 items-start">
      <!-- 채팅 영역 -->
      <div class="flex-1 min-w-0 flex flex-col">
        <!-- 진행 바 -->
        <div class="bg-white rounded-xl border border-gray-200 px-5 py-3 mb-4 flex items-center gap-3">
          <span class="text-sm font-semibold text-gray-700 shrink-0">티켓 등록</span>
          <div class="flex-1 bg-gray-100 rounded-full h-1.5">
            <div id="chat-prog" class="h-1.5 rounded-full bg-green-500 transition-all duration-500" style="width:0%"></div>
          </div>
          <span id="chat-prog-txt" class="text-xs text-gray-400 shrink-0 w-14 text-right"></span>
          <button onclick="renderCreateTicketForm()" class="text-xs text-gray-400 hover:text-green-700 transition shrink-0 border border-gray-200 rounded-lg px-2.5 py-1 hover:border-green-400">빠른 등록으로 전환</button>
          <button onclick="navigate('tickets')" class="text-xs text-gray-400 hover:text-gray-600 transition shrink-0">취소</button>
        </div>
        <!-- 메시지 목록 -->
        <div id="chat-msgs" class="space-y-4 mb-4 flex flex-col"></div>
        <!-- 입력 영역 -->
        <div id="chat-inp" class="bg-white rounded-xl border border-gray-200 p-4"></div>
      </div>
      <!-- 유사 티켓 사이드 패널 -->
      <div id="similar-panel" class="hidden w-72 shrink-0">
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 sticky top-4">
          <div class="flex items-center gap-2 mb-3">
            <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
            <span class="text-sm font-semibold text-amber-800">유사한 과거 티켓</span>
          </div>
          <p class="text-xs text-amber-600 mb-3">참고하거나 연관 티켓으로 연결할 수 있어요.</p>
          <div id="similar-list" class="space-y-2"></div>
        </div>
      </div>
    </div>
  `;

  // 첫 메시지: 유형 선택
  chatMsg('system', `안녕하세요, <strong>${currentUser.name}</strong>님! 👋<br>어떤 유형의 IT 요청을 하시겠어요?`);
  setTimeout(() => {
    $('#chat-inp').innerHTML = `
      <div class="grid grid-cols-2 gap-2">
        ${chatData.ticketTypes.map(t => `
          <button onclick="chatSelectType('${t.id}','${t.code}','${t.name.replace(/'/g,"&#39;")}')"
            class="chat-type-btn">
            <div class="font-semibold text-sm text-gray-800 mb-0.5">${t.name}</div>
            <div class="text-xs text-gray-400">${CHAT_TYPE_DESC[t.code] || ''}</div>
          </button>`).join('')}
      </div>`;
  }, 300);
}

function chatMsg(role, html) {
  const msgs = $('#chat-msgs');
  if (!msgs) return;
  const wrap = document.createElement('div');
  wrap.className = `flex items-start gap-3 chat-fade-in ${role === 'user' ? 'flex-row-reverse' : ''}`;
  const avatar = role === 'system'
    ? `<div class="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
         <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
       </div>`
    : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold text-gray-600">${currentUser.name[0]}</div>`;
  wrap.innerHTML = `${avatar}<div class="chat-bubble-${role}">${html}</div>`;
  msgs.appendChild(wrap);
  msgs.scrollTop = msgs.scrollHeight;
}

function chatProgress(cur, total) {
  const pct = total > 0 ? Math.round((cur / total) * 100) : 0;
  const bar = $('#chat-prog'), txt = $('#chat-prog-txt');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = total > 0 ? `${cur} / ${total}` : '';
}

function chatSelectType(id, code, name) {
  chatData.answers.ticketTypeId = id;
  chatData.answers._typeCode = code;
  chatData.answers._typeName = name;
  chatData.steps = chatBuildSteps(code);
  chatProgress(0, chatData.steps.length);
  chatMsg('user', name);
  setTimeout(() => chatStep(0), 400);
}

function chatStep(idx) {
  chatData.currentStep = idx;
  chatProgress(idx, chatData.steps.length);
  const step = chatData.steps[idx];
  if (!step) return;
  if (step.type === 'summary') {
    chatMsg('system', step.q);
    setTimeout(chatShowSummary, 350);
    return;
  }
  chatMsg('system', step.q.replace(/\n/g, '<br>'));
  setTimeout(() => chatShowInput(step), 350);
}

function chatAdvance() {
  const next = chatData.currentStep + 1;
  if (next < chatData.steps.length) setTimeout(() => chatStep(next), 400);
}

function chatBack() {
  const prevIdx = chatData.currentStep - 1;
  if (prevIdx < 0) return;
  const prevStep = chatData.steps[prevIdx];
  if (prevStep?.field) delete chatData.answers[prevStep.field];
  chatData.currentStep = prevIdx;
  chatProgress(prevIdx, chatData.steps.length);
  chatMsg('system', `↩ 이전 단계로 돌아갑니다.`);
  setTimeout(() => chatShowInput(prevStep), 200);
}

let _chatReqEditIndex = -1;
let _chatReqModalImages = [];
let _chatReqModalFiles = [];

function chatRenderReqList() {
  const el = $('#chat-req-list');
  if (!el) return;
  if (!chatData.requirements.length) {
    el.innerHTML = '<div class="text-xs text-gray-400 text-center py-2">요구사항을 1개 이상 추가해주세요.</div>';
    return;
  }
  el.innerHTML = chatData.requirements.map((r, i) => `
    <div class="border border-blue-100 rounded-xl p-3 bg-blue-50">
      <div class="flex items-start gap-2">
        <span class="w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center shrink-0 mt-0.5">${i + 1}</span>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-800">${r.title}</div>
          ${r.description ? `<div class="text-xs text-gray-500 mt-0.5 truncate">${r.description}</div>` : ''}
          ${r.images?.length ? `<div class="text-xs text-indigo-600 mt-0.5">🖼️ 이미지 ${r.images.length}장</div>` : ''}
          ${r.files?.length ? `<div class="text-xs text-gray-500 mt-0.5">📎 파일 ${r.files.length}개</div>` : ''}
        </div>
        <div class="flex gap-1 shrink-0">
          <button onclick="chatShowReqModal(${i})" class="text-xs text-blue-600 hover:bg-blue-100 px-2 py-1 rounded">수정</button>
          <button onclick="chatRemoveRequirement(${i})" class="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded">✕</button>
        </div>
      </div>
    </div>`).join('');
}

function chatRemoveRequirement(i) {
  chatData.requirements.splice(i, 1);
  chatRenderReqList();
  const nextBtn = $('#chat-req-next');
  if (nextBtn && chatData.requirements.length === 0) {
    nextBtn.disabled = true;
    nextBtn.className = 'w-full py-3 rounded-xl text-white text-sm font-semibold transition bg-gray-300 cursor-not-allowed';
  }
}

function chatShowReqModal(editIdx = -1) {
  _chatReqEditIndex = editIdx;
  const existing = editIdx >= 0 ? chatData.requirements[editIdx] : null;
  _chatReqModalImages = existing?.images ? [...existing.images] : [];
  _chatReqModalFiles  = existing?.files  ? [...existing.files]  : [];

  const modal = document.createElement('div');
  modal.id = 'chat-req-modal';
  modal.className = 'fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h3 class="text-lg font-bold text-gray-800">${existing ? '요구사항 수정' : '요구사항 추가'}</h3>
        <button type="button" onclick="document.getElementById('chat-req-modal')?.remove()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">제목 <span class="text-red-500">*</span></label>
          <input id="chat-modal-title" type="text" value="${existing ? existing.title.replace(/"/g, '&quot;') : ''}"
            placeholder="요구사항 제목을 입력하세요"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">설명</label>
          <textarea id="chat-modal-desc" rows="3" placeholder="요구사항 상세 설명 (선택)"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none">${existing?.description || ''}</textarea>
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">이미지 첨부</label>
          <p class="text-xs text-gray-400 mb-2">화면 모형·스크린샷에 도형/텍스트를 그려 여러 장 추가할 수 있습니다.</p>
          <button type="button" onclick="chatAddModalImage()"
            class="flex items-center gap-1.5 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-lg font-medium transition">
            🖼️ 이미지 도구로 추가
          </button>
          <div id="chat-modal-images" class="mt-3 grid grid-cols-3 gap-2"></div>
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">파일 첨부 <span class="text-xs text-gray-400 font-normal">(최대 20개)</span></label>
          <label class="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-lg px-4 py-3 text-sm text-gray-500 hover:text-blue-600 transition">
            📁 파일을 선택하거나 여기에 드래그하세요
            <input type="file" id="chat-modal-file-input" multiple class="hidden" onchange="chatHandleModalFileInput(event)" />
          </label>
          <div id="chat-modal-file-list" class="mt-2 space-y-1"></div>
        </div>
      </div>
      <div class="flex gap-3 justify-end px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
        <button type="button" onclick="document.getElementById('chat-req-modal')?.remove()"
          class="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">취소</button>
        <button type="button" onclick="chatSubmitReqModal()"
          class="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition">${existing ? '수정 저장' : '추가'}</button>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  chatRenderModalImages();
  chatRenderModalFileList();
  setTimeout(() => document.getElementById('chat-modal-title')?.focus(), 50);
}

function chatRenderModalImages() {
  const el = document.getElementById('chat-modal-images');
  if (!el) return;
  el.innerHTML = _chatReqModalImages.map((img, i) => `
    <div class="relative group rounded-lg overflow-hidden border border-gray-200">
      <img src="${img.imageData}" class="w-full h-24 object-cover cursor-pointer" onclick="chatViewModalImage(${i})" />
      <button type="button" onclick="chatRemoveModalImage(${i})"
        class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center">✕</button>
      <div class="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs text-center py-0.5">${i + 1}번</div>
    </div>`).join('');
}

function chatRenderModalFileList() {
  const el = document.getElementById('chat-modal-file-list');
  if (!el) return;
  el.innerHTML = _chatReqModalFiles.map((f, i) => `
    <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
      <span class="flex-1 truncate text-gray-700">📎 ${f.name}</span>
      <span class="text-gray-400 shrink-0">${formatFileSize(f.size)}</span>
      <button type="button" onclick="chatRemoveModalFile(${i})" class="text-gray-400 hover:text-red-500 shrink-0">✕</button>
    </div>`).join('');
}

function chatRemoveModalImage(i) {
  _chatReqModalImages.splice(i, 1);
  chatRenderModalImages();
}

function chatViewModalImage(i) {
  const img = _chatReqModalImages[i];
  if (!img) return;
  const ov = document.createElement('div');
  ov.className = 'fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4';
  ov.innerHTML = `<div class="relative max-w-4xl w-full"><button onclick="this.closest('.fixed').remove()" class="absolute -top-8 right-0 text-white text-2xl">✕</button><img src="${img.imageData}" class="w-full rounded-xl shadow-2xl" /></div>`;
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);
}

function chatRemoveModalFile(i) {
  _chatReqModalFiles.splice(i, 1);
  chatRenderModalFileList();
}

function chatHandleModalFileInput(e) {
  Array.from(e.target.files).forEach(f => {
    if (!_chatReqModalFiles.find(x => x.name === f.name && x.size === f.size)) _chatReqModalFiles.push(f);
  });
  e.target.value = '';
  chatRenderModalFileList();
}

function chatAddModalImage() {
  window._qAnnotCallback = (imageData, shapes) => {
    _chatReqModalImages.push({ imageData, shapes });
    window._qAnnotCallback = null;
    chatRenderModalImages();
  };
  openAnnotationModal(null, '요구사항 이미지');
}

function chatSubmitReqModal() {
  const title = document.getElementById('chat-modal-title')?.value.trim();
  const description = document.getElementById('chat-modal-desc')?.value.trim();
  if (!title) { toast('요구사항 제목을 입력해주세요.', 'error'); return; }
  const item = { title, description: description || null, images: [..._chatReqModalImages], files: [..._chatReqModalFiles] };
  if (_chatReqEditIndex >= 0) {
    chatData.requirements[_chatReqEditIndex] = item;
  } else {
    chatData.requirements.push(item);
  }
  document.getElementById('chat-req-modal')?.remove();
  chatRenderReqList();
  const nextBtn = $('#chat-req-next');
  if (nextBtn && chatData.requirements.length > 0) {
    nextBtn.disabled = false;
    nextBtn.className = 'w-full py-3 rounded-xl text-white text-sm font-semibold transition nh-btn';
  }
}

function chatSubmitRequirements() {
  if (!chatData.requirements.length) { toast('요구사항을 1개 이상 입력해주세요.', 'error'); return; }
  const titles = chatData.requirements.map(r => r.title).join(', ');
  chatMsg('user', `요구사항 ${chatData.requirements.length}건 등록: ${titles}`);
  chatAdvance();
}

function chatShowInput(step) {
  const inp = $('#chat-inp');
  if (!inp) return;

  if (step.type === 'text' || step.type === 'textarea') {
    const isArea = step.type === 'textarea';
    inp.innerHTML = `
      <div class="flex gap-2 items-end">
        ${isArea
          ? `<textarea id="chat-ti" rows="3" placeholder="${step.ph||''}" class="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none"></textarea>`
          : `<input id="chat-ti" type="text" placeholder="${step.ph||''}" class="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />`}
        <button onclick="chatSubmitText('${step.id}')" class="nh-btn px-5 py-3 rounded-xl text-white text-sm font-medium shrink-0">전송</button>
      </div>`;
    const ti = $('#chat-ti');
    ti.focus();
    if (!isArea) ti.addEventListener('keydown', e => { if (e.key === 'Enter') chatSubmitText(step.id); });
    if (step.id === 'title') {
      ti.addEventListener('input', () => {
        clearTimeout(chatData.simTimer);
        const q = ti.value.trim();
        if (q.length < 3) { $('#similar-panel')?.classList.add('hidden'); return; }
        chatData.simTimer = setTimeout(() => chatSearchSimilar(q), 500);
      });
    }

  } else if (step.type === 'chips') {
    inp.innerHTML = `
      <div class="flex flex-wrap gap-2">
        ${step.opts.map(o => `
          <button onclick="chatSelectChip('${step.id}','${o.replace(/'/g,"&#39;")}')"
            class="chat-chip-btn ${step.defaultVal===o?'border-green-500 bg-green-50 text-green-700':''}">${o}</button>`).join('')}
      </div>`;

  } else if (step.type === 'date') {
    const today = new Date().toISOString().split('T')[0];
    inp.innerHTML = `
      <div class="space-y-3">
        <div class="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div class="text-xs text-gray-400 mb-2">날짜를 선택해주세요</div>
          <input id="chat-date" type="date" min="${today}"
            class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 bg-white" />
        </div>
        <div class="flex gap-2">
          <button onclick="chatSubmitDate('${step.id}')" class="nh-btn flex-1 py-3 rounded-xl text-white text-sm font-medium">선택</button>
          <button onclick="chatSkip('${step.id}','${step.skipLabel||'건너뜀'}')" class="flex-1 py-3 border border-gray-300 rounded-xl text-sm text-gray-500 hover:bg-gray-50">${step.skipLabel||'건너뜀'}</button>
        </div>
      </div>`;
    // 날짜 입력 영역이 가려지지 않도록 스크롤
    setTimeout(() => inp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);

  } else if (step.type === 'user_search') {
    const autoAssigned = chatData._itbaAutoAssigned && chatData.itBa;
    inp.innerHTML = `
      <div class="space-y-2">
        ${autoAssigned ? `
        <div id="chat-auto-badge" class="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
          <span class="text-xs font-semibold text-green-700">✓ 업무 도메인 기준 자동 배정</span>
          <span class="font-medium text-sm text-green-800">${chatData.itBa.name}</span>
          <span class="text-xs text-green-500">(${chatData.itBa.department?.name || ''})</span>
          <button onclick="chatClearAutoItba()" class="ml-auto text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-0.5">변경</button>
        </div>` : ''}
        <div id="chat-manual-itba" class="${autoAssigned ? 'hidden' : ''}">
          <div id="chat-utags" class="flex flex-wrap gap-1.5 ${chatData.itBa && !autoAssigned ? '' : 'hidden'}">
            ${chatData.itBa && !autoAssigned ? `<span class="user-tag">${chatData.itBa.name} <button onclick="chatData.itBa=null;document.getElementById('chat-utags').classList.add('hidden');document.getElementById('chat-utags').innerHTML=''">&times;</button></span>` : ''}
          </div>
          <div class="flex gap-2 items-center">
            <div class="relative flex-1">
              <input id="chat-ui" type="text" placeholder="이름으로 검색..." class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <div id="chat-udd" class="hidden search-dropdown"></div>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="chatSubmitUser('${step.id}')" class="nh-btn flex-1 py-3 rounded-xl text-white text-sm font-medium">확인</button>
          ${step.skipLabel ? `<button onclick="chatSkip('${step.id}','${step.skipLabel}')" class="flex-1 py-3 border border-gray-300 rounded-xl text-sm text-gray-500 hover:bg-gray-50">${step.skipLabel}</button>` : ''}
        </div>
      </div>`;
    chatSetupUserDD('#chat-ui', '#chat-udd', step.endpoint, user => {
      chatData.itBa = user;
      chatData._itbaAutoAssigned = false;
      const tags = $('#chat-utags');
      tags.classList.remove('hidden');
      tags.innerHTML = `<span class="user-tag">${user.name} <button onclick="chatData.itBa=null;this.parentElement.parentElement.innerHTML='';this.parentElement.parentElement.classList.add('hidden')">&times;</button></span>`;
      $('#chat-ui').value = '';
    });

  } else if (step.type === 'requirements') {
    inp.innerHTML = `
      <div class="space-y-3">
        <div id="chat-req-list" class="space-y-2"></div>
        <button onclick="chatShowReqModal()"
          class="w-full flex items-center justify-center gap-2 border-2 border-dashed border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50 rounded-xl py-3 text-sm font-medium transition">
          + 요구사항 추가
        </button>
        <button id="chat-req-next" onclick="chatSubmitRequirements()"
          class="w-full py-3 rounded-xl text-white text-sm font-semibold transition ${chatData.requirements.length > 0 ? 'nh-btn' : 'bg-gray-300 cursor-not-allowed'}"
          ${chatData.requirements.length === 0 ? 'disabled' : ''}>
          다음 →
        </button>
      </div>`;
    chatRenderReqList();

  } else if (step.type === 'consensus') {
    inp.innerHTML = `
      <div class="space-y-2">
        <div id="chat-ctags" class="flex flex-wrap gap-1.5"></div>
        <div class="flex gap-2 items-center">
          <div class="relative flex-1">
            <input id="chat-ci" type="text" placeholder="결재자 이름으로 검색..." class="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <div id="chat-cdd" class="hidden search-dropdown"></div>
          </div>
          <button onclick="chatSubmitConsensus()" class="nh-btn px-5 py-3 rounded-xl text-white text-sm font-medium shrink-0">확인</button>
          <button onclick="chatSkip('consensus','합의 불필요')" class="px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-500 hover:bg-gray-50 shrink-0">합의 불필요</button>
        </div>
      </div>`;
    chatRenderConsTags();
    chatSetupUserDD('#chat-ci', '#chat-cdd', '/common/users/approvers', user => {
      if (!chatData.consensusApprovers.find(u => u.id === user.id)) {
        chatData.consensusApprovers.push(user);
        chatRenderConsTags();
      }
      $('#chat-ci').value = '';
    });
  }

  if (chatData.currentStep > 0) {
    const backBtn = document.createElement('button');
    backBtn.className = 'mt-2 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1';
    backBtn.innerHTML = '← 이전으로 돌아가기';
    backBtn.onclick = chatBack;
    inp.appendChild(backBtn);
  }
}

async function userDDLoad(endpoint, q, dd, onSelect) {
  try {
    const url = q ? `${endpoint}?q=${encodeURIComponent(q)}` : endpoint;
    const users = await api(url);
    dd.innerHTML = users.length
      ? users.map(u => `<div class="search-result-item" data-user='${JSON.stringify(u).replace(/'/g,"&#39;")}'>
          <div class="search-avatar">${u.name[0]}</div>
          <div><div class="text-sm font-medium">${u.name}</div><div class="text-xs text-gray-400">${u.department?.name||''} ${u.role ? '· ' + roleLabel[u.role] : ''}</div></div>
        </div>`).join('')
      : '<div class="px-4 py-3 text-sm text-gray-400">검색 결과가 없습니다.</div>';
    dd.querySelectorAll('[data-user]').forEach(item =>
      item.addEventListener('click', () => { onSelect(JSON.parse(item.dataset.user)); dd.classList.add('hidden'); })
    );
    dd.classList.remove('hidden');
  } catch {}
}

function chatSetupUserDD(inputSel, ddSel, endpoint, onSelect) {
  const input = $(inputSel), dd = $(ddSel);
  if (!input || !dd) return;
  let timer;

  // 포커스 시 전체 목록 즉시 표시
  input.addEventListener('focus', () => { userDDLoad(endpoint, '', dd, onSelect); });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    timer = setTimeout(() => userDDLoad(endpoint, q, dd, onSelect), 200);
  });

  document.addEventListener('click', e => {
    const wrap = input.closest('.relative') || input.parentElement;
    if (!wrap.contains(e.target) && !dd.contains(e.target)) dd.classList.add('hidden');
  });
}

function chatRenderConsTags() {
  const el = $('#chat-ctags');
  if (!el) return;
  el.innerHTML = chatData.consensusApprovers.map((u, i) =>
    `<span class="user-tag">${u.name}<button onclick="chatData.consensusApprovers.splice(${i},1);chatRenderConsTags()">&times;</button></span>`
  ).join('');
}

function chatSubmitText(stepId) {
  const val = $('#chat-ti')?.value.trim();
  if (!val) { toast('내용을 입력해주세요.', 'warn'); return; }
  const step = chatData.steps.find(s => s.id === stepId);
  chatData.answers[step.field] = val;
  chatMsg('user', val.replace(/\n/g, '<br>'));
  chatAdvance();
}

function chatSelectChip(stepId, value) {
  const step = chatData.steps.find(s => s.id === stepId);
  const actual = value;
  chatData.answers[step.field] = actual;
  chatMsg('user', value);

  // 업무 도메인 선택 시 IT BA 자동 조회
  if (stepId === 'businessDomain') {
    api(`/common/domain-itba-mapping?domain=${encodeURIComponent(value)}`)
      .then(itba => {
        if (itba) {
          chatData.itBa = itba;
          chatData._itbaAutoAssigned = true;
        } else {
          chatData._itbaAutoAssigned = false;
        }
      }).catch(() => {});
  }

  chatAdvance();
}

function chatSubmitDate(stepId) {
  const val = $('#chat-date')?.value;
  if (!val) { toast('날짜를 선택해주세요.', 'warn'); return; }
  const step = chatData.steps.find(s => s.id === stepId);
  chatData.answers[step.field] = val;
  chatMsg('user', val);
  chatAdvance();
}

function chatSkip(stepId, label) {
  chatMsg('user', label || '건너뜀');
  chatAdvance();
}

function chatClearAutoItba() {
  chatData.itBa = null;
  chatData._itbaAutoAssigned = false;
  const badge = document.getElementById('chat-auto-badge');
  const manual = document.getElementById('chat-manual-itba');
  if (badge) badge.classList.add('hidden');
  if (manual) manual.classList.remove('hidden');
  document.getElementById('chat-ui')?.focus();
}

function chatSubmitUser(stepId) {
  if (chatData._itbaAutoAssigned && chatData.itBa) {
    chatMsg('user', `${chatData.itBa.name} (자동 배정)`);
  } else {
    chatMsg('user', chatData.itBa ? `${chatData.itBa.name} (IT BA 지정)` : '지정 안 함');
  }
  chatAdvance();
}

function chatSubmitConsensus() {
  const names = chatData.consensusApprovers.map(u => u.name).join(', ');
  chatMsg('user', names || '합의 불필요');
  chatAdvance();
}

async function chatSearchSimilar(q) {
  try {
    const tickets = await api(`/common/tickets/similar?q=${encodeURIComponent(q)}`);
    const panel = $('#similar-panel'), list = $('#similar-list');
    if (!panel || !list) return;
    if (!tickets.length) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    list.innerHTML = tickets.map(t => {
      const diff = t.finalDifficulty || t.aiEstimatedDifficulty;
      const diffBadge = diff ? `<span class="text-xs px-1.5 py-0.5 rounded font-semibold ${DIFFICULTY_COLOR[diff]||''}">${DIFFICULTY_LABEL[diff]||diff}</span>` : '';
      const days = t.aiEstimatedDays ? `<span class="text-xs text-gray-400">${t.aiEstimatedDays}</span>` : '';
      return `
      <div class="bg-white rounded-lg border border-amber-100 p-3 text-sm">
        <div class="flex items-center gap-1.5 mb-1 flex-wrap">
          <span class="stage-badge status-${t.status}">${statusLabel[t.status]||t.status}</span>
          <span class="text-xs text-gray-400">${t.ticketTypeName||''}</span>
          ${diffBadge}${days}
        </div>
        <div class="font-medium text-gray-800 leading-snug mb-1 line-clamp-2">${t.title}</div>
        <div class="font-mono text-xs text-gray-400 mb-2">${t.ticketNumber}</div>
        <div class="flex gap-2">
          <button onclick="chatOpenTicketPreview('${t.id}')" class="text-xs text-blue-600 hover:underline">상세보기</button>
          <button id="link-btn-${t.id}" onclick="chatLinkTicket('${t.id}','${t.ticketNumber}','${t.title.replace(/'/g,"&#39;")}')"
            class="text-xs text-green-700 font-semibold hover:underline">+ 연관 연결</button>
        </div>
      </div>`;
    }).join('');
  } catch {}
}

async function chatOpenTicketPreview(id) {
  // 모달 컨테이너 생성
  const existing = $('#chat-preview-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'chat-preview-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="absolute inset-0 bg-black/40" onclick="document.getElementById('chat-preview-modal').remove()"></div>
    <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <span class="font-semibold text-gray-800">티켓 미리보기</span>
        <button onclick="document.getElementById('chat-preview-modal').remove()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <div id="chat-preview-body" class="overflow-y-auto p-6 text-sm space-y-4">
        <div class="text-gray-400">불러오는 중...</div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  try {
    const t = await api(`/tickets/${id}`);
    const diff = t.finalDifficulty || t.aiEstimatedDifficulty;
    const diffBadge = diff
      ? `<span class="px-2 py-0.5 rounded-lg text-xs font-bold ${DIFFICULTY_COLOR[diff]||''}">${DIFFICULTY_LABEL[diff]||diff}${t.aiEstimatedDays ? ' · ' + t.aiEstimatedDays : ''}</span>`
      : '';

    // 실제 소요 기간 계산 (첫 히스토리 ~ 마지막 히스토리)
    let elapsed = '';
    if (t.stageHistories?.length >= 2) {
      const ms = new Date(t.stageHistories.at(-1).createdAt) - new Date(t.stageHistories[0].createdAt);
      const days = Math.ceil(ms / 86400000);
      elapsed = `<span class="text-xs text-gray-400">실제 소요: ${days}일</span>`;
    }

    document.getElementById('chat-preview-body').innerHTML = `
      <div>
        <div class="flex items-center gap-2 text-gray-400 text-xs mb-1">
          <span class="font-mono">${t.ticketNumber}</span>
          <span>·</span><span>${t.ticketType.name}</span>
          <span>·</span><span>${formatDate(t.createdAt)}</span>
        </div>
        <h3 class="text-base font-bold text-gray-900 mb-2">${t.title}</h3>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="stage-badge status-${t.status}">${statusLabel[t.status]}</span>
          ${diffBadge}
          ${elapsed}
        </div>
      </div>

      ${t.businessDomain || t.subCategory || t.targetSystem ? `
      <div class="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl p-3">
        ${t.businessDomain ? `<div><div class="text-xs text-gray-400 mb-0.5">업무 도메인</div><div class="font-medium">${t.businessDomain}</div></div>` : ''}
        ${t.subCategory   ? `<div><div class="text-xs text-gray-400 mb-0.5">요청 구분</div><div class="font-medium">${t.subCategory}</div></div>` : ''}
        ${t.targetSystem  ? `<div><div class="text-xs text-gray-400 mb-0.5">대상 시스템</div><div class="font-medium">${t.targetSystem}</div></div>` : ''}
      </div>` : ''}

      <div>
        <div class="text-xs text-gray-400 mb-1">요청 내용</div>
        <pre class="text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-gray-50 rounded-xl p-3 text-xs">${t.description}</pre>
      </div>

      ${t.aiDifficultyReason ? `
      <div class="bg-blue-50 rounded-xl p-3">
        <div class="text-xs text-blue-400 mb-1">AI 난이도 판단 근거</div>
        <div class="text-xs text-blue-700">${t.aiDifficultyReason}</div>
      </div>` : ''}

      ${t.stageHistories?.length > 0 ? `
      <div>
        <div class="text-xs text-gray-400 mb-2">처리 이력</div>
        <div class="space-y-1.5">
          ${t.stageHistories.map(h => `
            <div class="flex items-start gap-2 text-xs">
              <span class="text-gray-300 mt-0.5">▸</span>
              <span class="text-gray-500 shrink-0">${formatDate(h.createdAt)}</span>
              <span class="font-medium text-gray-700">${h.stage.name}</span>
              <span class="text-gray-400">${h.actor.name}</span>
              ${h.comment ? `<span class="text-gray-400 truncate">"${h.comment}"</span>` : ''}
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="pt-2 border-t border-gray-100 flex justify-end">
        <button onclick="document.getElementById('chat-preview-modal').remove()"
          class="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm font-medium">닫기</button>
      </div>`;
  } catch {
    document.getElementById('chat-preview-body').innerHTML = '<div class="text-red-400">티켓을 불러올 수 없습니다.</div>';
  }
}

function chatLinkTicket(id, number, title) {
  if (chatData.linkedTickets.find(t => t.id === id)) { toast('이미 연결된 티켓입니다.', 'warn'); return; }
  chatData.linkedTickets.push({ id, number, title });
  const btn = $(`#link-btn-${id}`);
  if (btn) { btn.textContent = '✓ 연결됨'; btn.className = 'text-xs text-green-600 font-semibold'; btn.disabled = true; }
  toast(`${number} 연결됨`);
}

function chatShowSummary() {
  const a = chatData.answers;
  const descParts = [
    a.why        ? `[요청 배경 및 기대 효과]\n${a.why}` : '',
    a.regulation && a.regulation !== '해당 없음' ? `\n[근거]\n${a.regulation}` : '',
  ].filter(Boolean).join('');

  $('#chat-inp').innerHTML = `
    <div class="space-y-4">
      <div class="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-x-6 gap-y-2.5">
          <div><div class="text-xs text-gray-400 mb-0.5">유형</div><div class="font-semibold">${a._typeName}</div></div>
          ${a.businessDomain ? `<div><div class="text-xs text-gray-400 mb-0.5">업무 도메인</div><div class="font-semibold">${a.businessDomain}</div></div>` : ''}
          ${a.regulation && a.regulation !== '해당 없음' ? `<div><div class="text-xs text-gray-400 mb-0.5">근거</div><div class="font-semibold">${a.regulation}</div></div>` : ''}
          ${a.subCategory  ? `<div><div class="text-xs text-gray-400 mb-0.5">세부구분</div><div class="font-semibold">${a.subCategory}</div></div>` : ''}
          ${a.targetSystem ? `<div><div class="text-xs text-gray-400 mb-0.5">대상시스템</div><div class="font-semibold">${a.targetSystem}</div></div>` : ''}
          ${a.dueDate      ? `<div><div class="text-xs text-gray-400 mb-0.5">완료 희망일</div><div class="font-semibold">${a.dueDate}</div></div>` : ''}
          ${chatData.itBa  ? `<div><div class="text-xs text-gray-400 mb-0.5">IT BA</div><div class="font-semibold">${chatData.itBa.name}</div></div>` : ''}
        </div>
        <div class="pt-2.5 border-t border-gray-100">
          <div class="text-xs text-gray-400 mb-1">제목</div>
          <div class="font-semibold">${a.title}</div>
        </div>
        <div>
          <div class="text-xs text-gray-400 mb-1">내용 (자동 구성)</div>
          <pre class="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed bg-white border border-gray-100 rounded-lg p-3">${descParts}</pre>
        </div>
        ${chatData.requirements.length > 0 ? `
        <div class="pt-2.5 border-t border-gray-100">
          <div class="text-xs text-gray-400 mb-1">요구사항 (${chatData.requirements.length}건)</div>
          <div class="space-y-1">
            ${chatData.requirements.map(r => `<div class="text-xs text-gray-700">• ${r.title}</div>`).join('')}
          </div>
        </div>` : ''}
        ${chatData.linkedTickets.length > 0 ? `
        <div class="pt-2.5 border-t border-gray-100">
          <div class="text-xs text-gray-400 mb-1">연관 티켓 (${chatData.linkedTickets.length}건)</div>
          ${chatData.linkedTickets.map(t=>`<div class="text-xs font-mono text-green-700">${t.number} — ${t.title}</div>`).join('')}
        </div>` : ''}
        ${chatData.consensusApprovers.length > 0 ? `
        <div class="pt-2.5 border-t border-gray-100">
          <div class="text-xs text-gray-400 mb-1">합의자</div>
          <div class="flex flex-wrap gap-1">${chatData.consensusApprovers.map(u=>`<span class="user-tag">${u.name}</span>`).join('')}</div>
        </div>` : ''}
      </div>

      <!-- AI 난이도 판정 카드 -->
      <div id="ai-difficulty-card" class="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div class="flex items-center gap-2 mb-2">
          <svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
          <span class="text-sm font-semibold text-blue-800">AI 개발 난이도 분석 중...</span>
        </div>
        <div id="ai-difficulty-body" class="text-xs text-blue-600">잠시 기다려 주세요.</div>
      </div>

      <div class="flex gap-2">
        <button onclick="chatSubmitTicket()" class="nh-btn flex-1 py-3 rounded-xl text-white font-semibold text-sm">티켓 등록</button>
        <button onclick="renderCreateTicket()" class="px-5 py-3 border border-gray-300 text-gray-600 rounded-xl text-sm hover:bg-gray-50">처음부터</button>
      </div>
    </div>`;

  // AI 난이도 판정 비동기 호출
  chatEstimateDifficulty(a, descParts);
}

async function chatEstimateDifficulty(a, descParts) {
  try {
    const result = await api('/common/ai/estimate-difficulty', {
      method: 'POST',
      body: {
        ticketData: {
          title: a.title,
          description: descParts,
          businessDomain: a.businessDomain || '',
          subCategory: a.subCategory || '',
          targetSystem: a.targetSystem || '',
          why: a.why || '',
          regulation: a.regulation || '',
          ticketTypeName: a._typeName || '',
        }
      }
    });

    chatData.aiDifficulty = result;

    const card = $('#ai-difficulty-card');
    const body = $('#ai-difficulty-body');
    if (!card || !body) return;

    const colorClass = DIFFICULTY_COLOR[result.difficulty] || 'text-gray-600 bg-gray-50';
    const label = DIFFICULTY_LABEL[result.difficulty] || result.difficulty;

    card.className = `rounded-xl border p-4 ${result.difficulty === 'VERY_HIGH' ? 'border-red-200 bg-red-50' : result.difficulty === 'HIGH' ? 'border-orange-200 bg-orange-50' : result.difficulty === 'MEDIUM' ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-green-50'}`;
    card.querySelector('span').className = `text-sm font-semibold ${result.difficulty === 'VERY_HIGH' ? 'text-red-800' : result.difficulty === 'HIGH' ? 'text-orange-800' : result.difficulty === 'MEDIUM' ? 'text-amber-800' : 'text-green-800'}`;
    card.querySelector('span').textContent = 'AI 개발 난이도 분석 결과';

    body.innerHTML = `
      <div class="flex items-center gap-3 mb-2">
        <span class="text-base font-bold px-3 py-1 rounded-lg ${colorClass}">${label}</span>
        <span class="font-semibold">예상 기간: ${result.estimatedDays}</span>
      </div>
      <div class="text-gray-600 leading-relaxed">${result.reason}</div>
      ${result.similarTickets?.length > 0 ? `
      <div class="mt-2 pt-2 border-t border-gray-200">
        <div class="text-gray-400 mb-1">유사 티켓 참고</div>
        ${result.similarTickets.map(t => `<div class="text-gray-500">• ${t.title} (${t.finalDifficulty || t.aiEstimatedDifficulty || '난이도 미정'} / ${t.aiEstimatedDays || '-'})</div>`).join('')}
      </div>` : ''}`;
  } catch {
    const body = $('#ai-difficulty-body');
    if (body) body.textContent = 'AI 분석을 불러올 수 없습니다. (API 키 미설정)';
  }
}

async function chatSubmitTicket() {
  const a = chatData.answers;
  const descParts = [
    a.why     ? `[배경/목적]\n${a.why}`       : '',
    a.who     ? `\n[주요 사용자]\n${a.who}`    : '',
    a.benefit ? `\n[기대 효과]\n${a.benefit}`  : '',
  ].filter(Boolean).join('');
  try {
    const aiD = chatData.aiDifficulty;
    const ticket = await api('/tickets', {
      method: 'POST',
      body: {
        ticketTypeId: a.ticketTypeId,
        title: a.title,
        description: descParts,
        dueDate: a.dueDate || null,
        subCategory: a.subCategory || null,
        targetSystem: a.targetSystem || null,
        businessDomain: a.businessDomain || null,
        itBaId: chatData.itBa?.id || null,
        consensusApproverIds: chatData.consensusApprovers.map(u => u.id),
        aiEstimatedDifficulty: aiD?.difficulty || null,
        aiEstimatedDays: aiD?.estimatedDays || null,
        aiDifficultyReason: aiD?.reason || null,
      },
    });
    for (const linked of chatData.linkedTickets) {
      try { await api(`/tickets/${ticket.id}/relations`, { method:'POST', body:{ relatedTicketId:linked.id, relationType:'RELATED_TO' } }); } catch {}
    }
    const createdReqs = await Promise.all(chatData.requirements.map(r =>
      api(`/tickets/${ticket.id}/requirements`, { method: 'POST', body: { title: r.title, description: r.description || null } })
    ));
    await Promise.allSettled(createdReqs.map(async (req, i) => {
      const chatReq = chatData.requirements[i];
      if (!req?.id) return;
      if (chatReq?.images?.length) {
        await Promise.allSettled(chatReq.images.map(img =>
          api(`/collab/requirements/${req.id}/annotations`, {
            method: 'POST', body: { imageData: img.imageData, shapes: img.shapes || [] },
          })
        ));
      }
      if (chatReq?.files?.length) {
        const fd = new FormData();
        chatReq.files.forEach(f => fd.append('files', f));
        const token = localStorage.getItem('token');
        await fetch(`/api/collab/requirements/${req.id}/files`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        }).catch(() => {});
      }
    }));
    // DEV 유형: 요구사항 등록 단계 자동 제출 → 요구사항 검토 단계로 이동
    if (a._typeCode === 'DEV') {
      await api(`/tickets/${ticket.id}/process`, { method: 'POST', body: { action: 'COMPLETED', comment: '요구사항 등록 완료' } }).catch(() => {});
    }
    toast('티켓이 등록되었습니다!');
    navigate('ticket-detail', { id: ticket.id });
  } catch (err) { toast(err.message, 'error'); }
}

// ── 빠른 등록 (기존 폼 방식) ──────────────────────────────────
async function renderCreateTicketForm() {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm p-6">불러오는 중...</div>';
  let ticketTypes, ctState = { itBa: null, consensusApprovers: [] };
  try { ticketTypes = await api('/common/ticket-types'); } catch (err) { el.innerHTML = `<div class="text-red-500 p-6">${err.message}</div>`; return; }

  const today = new Date().toISOString().split('T')[0];
  const ym = today.slice(0,7).replace('-','');

  el.innerHTML = `
    <div class="max-w-3xl mx-auto space-y-4 pb-8">
      <!-- 헤더 -->
      <div class="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-3">
        <span class="text-sm font-semibold text-gray-700">빠른 등록</span>
        <div class="flex-1"></div>
        <button onclick="renderCreateTicket()" class="text-xs text-gray-400 hover:text-green-700 border border-gray-200 rounded-lg px-2.5 py-1 hover:border-green-400 transition">대화형 등록으로 전환</button>
        <button onclick="navigate('tickets')" class="text-xs text-gray-400 hover:text-gray-600 transition">취소</button>
      </div>
      <!-- 요청 정보 -->
      <div class="form-card">
        <div class="form-card-header"><div class="form-card-header-bar"></div><span class="form-card-title">요청 정보</span></div>
        <div class="info-grid">
          <div><div class="info-grid-item-label">요청자</div><div class="info-grid-item-value">${currentUser.name}</div></div>
          <div><div class="info-grid-item-label">요청부서</div><div class="info-grid-item-value">${currentUser.department?.name||'-'}</div></div>
          <div><div class="info-grid-item-label">요청일자</div><div class="info-grid-item-value">${today}</div></div>
          <div><div class="info-grid-item-label">티켓번호</div><div class="info-grid-item-value font-mono text-gray-400 text-xs">SR-${ym}-####</div></div>
        </div>
      </div>
      <form id="quick-form" class="space-y-4">
        <!-- 유형 + 내용 -->
        <div class="form-card">
          <div class="form-card-header"><div class="form-card-header-bar"></div><span class="form-card-title">티켓 내용</span></div>
          <div class="form-card-body space-y-4">
            <div>
              <label class="form-label">요청 유형 <span class="text-red-500">*</span></label>
              <select id="q-type" required class="form-select">
                <option value="">선택하세요</option>
                ${ticketTypes.map(t=>`<option value="${t.id}" data-code="${t.code}">${t.name}</option>`).join('')}
              </select>
            </div>
            <div id="sub-DEV" class="hidden grid grid-cols-2 gap-4">
              <div><label class="form-label">요청구분 <span class="text-red-500">*</span></label>
                <select id="q-sub" class="form-select"><option value="">선택</option>${CHAT_DEV_SUBCATS.map(o=>`<option>${o}</option>`).join('')}</select></div>
              <div><label class="form-label">개발 요청 대상 <span class="text-red-500">*</span></label>
                <select id="q-sys" class="form-select"><option value="">선택</option>${CHAT_DEV_SYSTEMS.map(o=>`<option>${o}</option>`).join('')}</select></div>
            </div>
            <div id="sub-CHG" class="hidden">
              <label class="form-label">상세유형 <span class="text-red-500">*</span></label>
              <select id="q-sub-chg" class="form-select"><option value="">선택</option>${CHAT_CHG_TYPES.map(o=>`<option>${o}</option>`).join('')}</select>
            </div>
            <div><label class="form-label">제목 <span class="text-red-500">*</span></label>
              <input id="q-title" type="text" required placeholder="요청 제목" class="form-input" /></div>
            <div><label class="form-label">내용 <span class="text-red-500">*</span></label>
              <textarea id="q-desc" required rows="5" placeholder="요청 내용을 상세히 입력하세요" class="form-input" style="resize:vertical"></textarea></div>
          </div>
        </div>
        <!-- 옵션 -->
        <div class="form-card">
          <div class="form-card-header"><div class="form-card-header-bar"></div><span class="form-card-title">옵션</span></div>
          <div class="form-card-body">
            <div>
              <label class="form-label">요청기한</label>
              <input id="q-due" type="date" min="${today}" class="form-input" />
              <p class="text-xs text-gray-400 mt-1">기한에 따라 우선순위가 자동으로 결정됩니다 (7일↓ 긴급 / 14일↓ 높음 / 30일↓ 보통 / 그 이상 낮음)</p>
            </div>
          </div>
        </div>
        <!-- 업무 도메인 + IT BA -->
        <div class="form-card">
          <div class="form-card-header"><div class="form-card-header-bar"></div><span class="form-card-title">업무 도메인 &amp; IT BA</span></div>
          <div class="form-card-body space-y-4">
            <div>
              <label class="form-label">업무 도메인</label>
              <select id="q-biz-domain" class="form-select" onchange="qOnDomainChange(this.value)">
                <option value="">선택하세요</option>
                ${CHAT_BIZ_DOMAINS.map(d=>`<option value="${d}">${d}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="form-label">IT BA <span class="text-red-500">*</span></label>
              <div id="q-ba-auto-badge" class="hidden mb-2 flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
                <span class="text-xs font-semibold text-green-700">✓ 자동 배정</span>
                <span id="q-ba-auto-name" class="text-sm font-medium text-green-800"></span>
                <button type="button" onclick="qClearAutoItba()" class="ml-auto text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded px-2 py-0.5">변경</button>
              </div>
              <div id="q-ba-manual">
                <div class="relative">
                  <div id="q-ba-box" class="form-input flex items-center gap-2 flex-wrap cursor-text min-h-[44px]" onclick="document.getElementById('q-ba').focus()">
                    <div id="q-ba-tag" class="hidden user-tag"><span id="q-ba-txt"></span><button type="button" onclick="ctState.itBa=null;document.getElementById('q-ba-tag').classList.add('hidden');document.getElementById('q-ba').placeholder='이름으로 검색...'">&times;</button></div>
                    <input id="q-ba" type="text" placeholder="이름으로 검색..." autocomplete="off" class="flex-1 outline-none text-sm bg-transparent min-w-[140px]" />
                  </div>
                  <div id="q-ba-dd" class="hidden search-dropdown"><div id="q-ba-res"></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <!-- 합의 -->
        <div class="form-card">
          <div class="form-card-header"><div class="form-card-header-bar"></div><span class="form-card-title">합의 요청</span></div>
          <div class="form-card-body space-y-4">
            <div class="flex items-center gap-5">
              <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="q-con-yn" value="N" checked class="accent-green-600 w-4 h-4" /><span class="text-sm font-medium">N (불필요)</span></label>
              <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="q-con-yn" value="Y" class="accent-green-600 w-4 h-4" /><span class="text-sm font-medium">Y (필요)</span></label>
            </div>
            <div id="q-con-sec" class="hidden">
              <div class="relative">
                <div class="form-input flex items-center gap-2 flex-wrap cursor-text min-h-[44px]" onclick="document.getElementById('q-con-inp').focus()">
                  <div id="q-con-tags" class="flex flex-wrap gap-1.5"></div>
                  <input id="q-con-inp" type="text" placeholder="결재자 이름으로 검색..." autocomplete="off" class="flex-1 outline-none text-sm bg-transparent min-w-[140px]" />
                </div>
                <div id="q-con-dd" class="hidden search-dropdown"><div id="q-con-res"></div></div>
              </div>
            </div>
          </div>
        </div>
        <!-- 참조자 -->
        <div class="form-card">
          <div class="form-card-header">
            <div class="form-card-header-bar"></div>
            <span class="form-card-title">참조자</span>
            <span class="text-xs text-gray-400 ml-2 font-normal">워크플로우 열람 및 요구사항 의견 작성 가능</span>
          </div>
          <div class="form-card-body">
            <div class="relative">
              <div class="form-input flex items-center gap-2 flex-wrap cursor-text min-h-[44px]" onclick="document.getElementById('q-watcher-inp').focus()">
                <div id="q-watcher-tags" class="flex flex-wrap gap-1.5"></div>
                <input id="q-watcher-inp" type="text" placeholder="이름으로 검색..." autocomplete="off" class="flex-1 outline-none text-sm bg-transparent min-w-[140px]" />
              </div>
              <div id="q-watcher-dd" class="hidden search-dropdown"><div id="q-watcher-res"></div></div>
            </div>
          </div>
        </div>
        <!-- 첨부파일 -->
        <div class="form-card">
          <div class="form-card-header">
            <div class="form-card-header-bar"></div>
            <span class="form-card-title">첨부파일</span>
            <span class="text-xs text-gray-400 ml-2 font-normal">파일당 최대 10MB</span>
          </div>
          <div class="form-card-body">
            <label id="q-file-drop" class="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-green-400 hover:bg-green-50 transition">
              <svg class="w-8 h-8 text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              <span class="text-sm text-gray-400">클릭하거나 파일을 여기로 드래그하세요</span>
              <input id="q-file-input" type="file" multiple class="hidden" />
            </label>
            <div id="q-file-list" class="mt-3 space-y-2"></div>
          </div>
        </div>
        <!-- 요구사항 -->
        <div class="form-card">
          <div class="form-card-header">
            <div class="form-card-header-bar"></div>
            <span class="form-card-title">요구사항 <span class="text-red-500">*</span></span>
            <span class="text-xs text-gray-400 ml-2 font-normal">최소 1개 이상 등록</span>
          </div>
          <div class="form-card-body space-y-3">
            <div id="q-req-list" class="space-y-2"></div>
            <button type="button" onclick="qShowReqModal()"
              class="w-full flex items-center justify-center gap-2 border-2 border-dashed border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50 rounded-xl py-3 text-sm font-medium transition">
              + 요구사항 추가
            </button>
          </div>
        </div>
        <div class="flex gap-3">
          <button type="submit" class="nh-btn flex-1 py-3 rounded-xl text-white font-semibold text-sm">티켓 등록</button>
          <button type="button" onclick="navigate('tickets')" class="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl text-sm hover:bg-gray-50 font-medium">취소</button>
        </div>
      </form>
    </div>`;

  // 유형 변경
  $('#q-type').addEventListener('change', function() {
    const code = this.options[this.selectedIndex]?.dataset.code || '';
    ['DEV','CHG'].forEach(c => { const el = $(`#sub-${c}`); if(el) el.classList.toggle('hidden', code !== c); });
  });
  // 합의 토글
  $$('input[name="q-con-yn"]').forEach(r => r.addEventListener('change', function() { $('#q-con-sec').classList.toggle('hidden', this.value==='N'); }));

  // 도메인 자동 배정
  window.qOnDomainChange = async function(domain) {
    if (!domain) return;
    try {
      const itba = await api(`/common/domain-itba-mapping?domain=${encodeURIComponent(domain)}`);
      if (itba) {
        ctState.itBa = itba;
        $('#q-ba-auto-name').textContent = `${itba.name} (${itba.department?.name || roleLabel[itba.role]})`;
        $('#q-ba-auto-badge').classList.remove('hidden');
        $('#q-ba-manual').classList.add('hidden');
      } else {
        $('#q-ba-auto-badge').classList.add('hidden');
        $('#q-ba-manual').classList.remove('hidden');
      }
    } catch (e) {
      $('#q-ba-auto-badge').classList.add('hidden');
      $('#q-ba-manual').classList.remove('hidden');
    }
  };
  window.qClearAutoItba = function() {
    ctState.itBa = null;
    $('#q-ba-auto-badge').classList.add('hidden');
    $('#q-ba-manual').classList.remove('hidden');
    $('#q-ba').focus();
  };

  // IT BA 검색
  chatSetupUserDD('#q-ba', '#q-ba-dd', '/common/users/it-ba', user => {
    ctState.itBa = user;
    $('#q-ba-tag').classList.remove('hidden');
    $('#q-ba-txt').textContent = `${user.name} (${user.department?.name||roleLabel[user.role]})`;
    $('#q-ba').value = ''; $('#q-ba').placeholder = '';
    $('#q-ba-dd').classList.add('hidden');
  });
  // 합의자 검색
  const qConApprovers = [];
  chatSetupUserDD('#q-con-inp', '#q-con-dd', '/common/users/approvers', user => {
    if (qConApprovers.find(u=>u.id===user.id)) { toast('이미 추가됨','warn'); return; }
    qConApprovers.push(user);
    $('#q-con-tags').innerHTML = qConApprovers.map((u,i)=>`<span class="user-tag">${u.name}<button onclick="qConApprovers.splice(${i},1);this.closest('#q-con-tags').innerHTML=''">&times;</button></span>`).join('');
    $('#q-con-inp').value = ''; $('#q-con-dd').classList.add('hidden');
  });

  // 참조자 검색
  const qWatchers = [];
  function qRenderWatcherTags() {
    const el = $('#q-watcher-tags');
    el.innerHTML = qWatchers.map((u, i) => `
      <span class="user-tag" data-idx="${i}">${u.name} <span class="text-xs opacity-60">(${u.department?.name || roleLabel[u.role] || u.role})</span>
        <button type="button" data-remove="${i}">&times;</button>
      </span>`).join('');
    el.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        qWatchers.splice(parseInt(btn.dataset.remove), 1);
        qRenderWatcherTags();
      });
    });
  }
  chatSetupUserDD('#q-watcher-inp', '#q-watcher-dd', '/common/users/all', user => {
    if (qWatchers.find(u => u.id === user.id)) { toast('이미 추가됨', 'warn'); return; }
    qWatchers.push(user);
    qRenderWatcherTags();
    $('#q-watcher-inp').value = ''; $('#q-watcher-dd').classList.add('hidden');
  });

  // 첨부파일
  const qFiles = [];
  function qRenderFileList() {
    $('#q-file-list').innerHTML = qFiles.map((f, i) => `
      <div class="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm">
        <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
        <span class="flex-1 truncate">${f.name}</span>
        <span class="text-xs text-gray-400 shrink-0">${formatFileSize(f.size)}</span>
        <button type="button" onclick="qFiles.splice(${i},1);qRenderFileList()" class="text-gray-300 hover:text-red-500 shrink-0">✕</button>
      </div>`).join('');
  }
  $('#q-file-input').addEventListener('change', e => {
    [...e.target.files].forEach(f => { if (!qFiles.find(x => x.name === f.name)) qFiles.push(f); });
    e.target.value = '';
    qRenderFileList();
  });
  const dropZone = $('#q-file-drop');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('border-green-400','bg-green-50'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-green-400','bg-green-50'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('border-green-400','bg-green-50');
    [...e.dataTransfer.files].forEach(f => { if (!qFiles.find(x => x.name === f.name)) qFiles.push(f); });
    qRenderFileList();
  });

  // 요구사항 추가 (이미지 포함)
  const qRequirements = []; // { title, description, images: [{imageData, shapes}] }
  let _qEditIndex = -1;    // 수정 중인 인덱스
  let _qModalImages = []; // 팝업 내 임시 이미지 목록
  let _qModalFiles = [];  // 팝업 내 임시 파일 목록

  function qRenderReqList() {
    $('#q-req-list').innerHTML = qRequirements.length
      ? qRequirements.map((r, i) => `
          <div class="border border-blue-100 rounded-xl p-3 bg-blue-50">
            <div class="flex items-start gap-2">
              <span class="w-5 h-5 bg-blue-600 text-white rounded-full text-xs flex items-center justify-center shrink-0 mt-0.5">${i+1}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-800">${r.title}</div>
                ${r.description ? `<div class="text-xs text-gray-500 mt-0.5 truncate">${r.description}</div>` : ''}
                ${r.images?.length ? `<div class="text-xs text-indigo-600 mt-0.5">🖼️ 이미지 ${r.images.length}장</div>` : ''}
                ${r.files?.length ? `<div class="text-xs text-gray-500 mt-0.5">📎 파일 ${r.files.length}개</div>` : ''}
              </div>
              <div class="flex gap-1 shrink-0">
                <button type="button" onclick="qShowReqModal(${i})" class="text-xs text-blue-600 hover:bg-blue-100 px-2 py-1 rounded">수정</button>
                <button type="button" onclick="qRequirements.splice(${i},1);qRenderReqList()" class="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded">✕</button>
              </div>
            </div>
          </div>`).join('')
      : '<div class="text-xs text-gray-400 text-center py-2">요구사항을 1개 이상 추가해주세요.</div>';
  }

  function qRenderModalImages() {
    const el = document.getElementById('q-modal-images');
    if (!el) return;
    if (!_qModalImages.length) { el.innerHTML = ''; return; }
    el.innerHTML = _qModalImages.map((img, i) => `
      <div class="relative group rounded-lg overflow-hidden border border-gray-200">
        <img src="${img.imageData}" class="w-full h-24 object-cover cursor-pointer" onclick="qViewModalImage(${i})" />
        <button type="button" onclick="qRemoveModalImage(${i})"
          class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs opacity-0 group-hover:opacity-100 transition flex items-center justify-center">✕</button>
        <div class="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs text-center py-0.5">${i+1}번</div>
      </div>`).join('');
  }

  window.qRemoveModalImage = function(i) {
    _qModalImages.splice(i, 1);
    qRenderModalImages();
  };

  window.qViewModalImage = function(i) {
    const img = _qModalImages[i];
    if (!img) return;
    const ov = document.createElement('div');
    ov.className = 'fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4';
    ov.innerHTML = `<div class="relative max-w-4xl w-full"><button onclick="this.closest('.fixed').remove()" class="absolute -top-8 right-0 text-white text-2xl">✕</button><img src="${img.imageData}" class="w-full rounded-xl shadow-2xl" /></div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  };

  function qRenderModalFileList() {
    const el = document.getElementById('q-modal-file-list');
    if (!el) return;
    el.innerHTML = _qModalFiles.map((f, i) => `
      <div class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-xs">
        <span class="flex-1 truncate text-gray-700">📎 ${f.name}</span>
        <span class="text-gray-400 shrink-0">${formatFileSize(f.size)}</span>
        <button type="button" onclick="qRemoveModalFile(${i})" class="text-gray-400 hover:text-red-500 shrink-0">✕</button>
      </div>`).join('');
  }

  window.qRemoveModalFile = function(i) {
    _qModalFiles.splice(i, 1);
    qRenderModalFileList();
  };

  window.qShowReqModal = function(editIdx = -1) {
    _qEditIndex = editIdx;
    const existing = editIdx >= 0 ? qRequirements[editIdx] : null;
    _qModalImages = existing?.images ? [...existing.images] : [];
    _qModalFiles = existing?.files ? [...existing.files] : [];

    const modal = document.createElement('div');
    modal.id = 'q-req-modal';
    modal.className = 'fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h3 class="text-lg font-bold text-gray-800">${existing ? '요구사항 수정' : '요구사항 추가'}</h3>
          <button type="button" onclick="document.getElementById('q-req-modal')?.remove()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div class="px-6 py-5 space-y-4">
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">제목 <span class="text-red-500">*</span></label>
            <input id="q-modal-title" type="text" value="${existing ? existing.title.replace(/"/g,'&quot;') : ''}"
              placeholder="요구사항 제목을 입력하세요"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">설명</label>
            <textarea id="q-modal-desc" rows="3" placeholder="요구사항 상세 설명 (선택)"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none">${existing?.description || ''}</textarea>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">이미지 첨부</label>
            <p class="text-xs text-gray-400 mb-2">화면 모형·스크린샷에 도형/텍스트를 그려 여러 장 추가할 수 있습니다.</p>
            <button type="button" onclick="qAddModalImage()"
              class="flex items-center gap-1.5 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-lg font-medium transition">
              🖼️ 이미지 도구로 추가
            </button>
            <div id="q-modal-images" class="mt-3 grid grid-cols-3 gap-2"></div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 mb-1 block">파일 첨부 <span class="text-xs text-gray-400 font-normal">(최대 20개)</span></label>
            <label class="flex items-center gap-2 cursor-pointer border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-lg px-4 py-3 text-sm text-gray-500 hover:text-blue-600 transition">
              📁 파일을 선택하거나 여기에 드래그하세요
              <input type="file" id="q-modal-file-input" multiple class="hidden" onchange="qHandleModalFileInput(event)" />
            </label>
            <div id="q-modal-file-list" class="mt-2 space-y-1"></div>
          </div>
        </div>
        <div class="flex gap-3 justify-end px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button type="button" onclick="document.getElementById('q-req-modal')?.remove()" class="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">취소</button>
          <button type="button" onclick="qSubmitReqModal()" class="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition">${existing ? '수정 저장' : '추가'}</button>
        </div>
      </div>`;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    qRenderModalImages();
    qRenderModalFileList();
    setTimeout(() => document.getElementById('q-modal-title')?.focus(), 50);
  };

  window.qHandleModalFileInput = function(e) {
    const newFiles = Array.from(e.target.files);
    newFiles.forEach(f => {
      if (!_qModalFiles.find(x => x.name === f.name && x.size === f.size)) _qModalFiles.push(f);
    });
    e.target.value = '';
    qRenderModalFileList();
  };

  window.qAddModalImage = function() {
    _pendingAnnotation = null;
    window._qAnnotCallback = (imageData, shapes) => {
      _qModalImages.push({ imageData, shapes });
      window._qAnnotCallback = null;
      qRenderModalImages();
    };
    openAnnotationModal(null, '요구사항 이미지');
  };

  window.qSubmitReqModal = function() {
    const title = document.getElementById('q-modal-title')?.value.trim();
    const description = document.getElementById('q-modal-desc')?.value.trim();
    if (!title) { toast('요구사항 제목을 입력해주세요.', 'error'); return; }

    const item = { title, description, images: [..._qModalImages], files: [..._qModalFiles] };
    if (_qEditIndex >= 0) {
      qRequirements[_qEditIndex] = item;
    } else {
      qRequirements.push(item);
    }
    document.getElementById('q-req-modal')?.remove();
    qRenderReqList();
  };

  qRenderReqList();

  // 폼 제출
  $('#quick-form').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
  });
  $('#quick-form').addEventListener('submit', async e => {
    e.preventDefault();
    const ts = $('#q-type'), code = ts.options[ts.selectedIndex]?.dataset.code;
    let subCategory = null, targetSystem = null;
    if (code==='DEV') {
      subCategory = $('#q-sub').value; targetSystem = $('#q-sys').value;
      if (!subCategory||!targetSystem) { toast('요청구분과 개발 요청 대상을 선택해주세요.','error'); return; }
    } else if (code==='CHG') {
      subCategory = $('#q-sub-chg').value;
      if (!subCategory) { toast('상세유형을 선택해주세요.','error'); return; }
    }
    if (qRequirements.length === 0) { toast('요구사항을 1개 이상 등록해주세요.','error'); return; }
    if (!ctState.itBa) { toast('IT BA를 지정해주세요. (영향도 분석 담당자)','error'); $('#q-ba').focus(); return; }
    const needCon = $('input[name="q-con-yn"]:checked').value==='Y';
    if (needCon && qConApprovers.length===0) { toast('합의자를 1명 이상 선택해주세요.','error'); return; }
    try {
      const ticket = await api('/tickets', { method:'POST', body:{
        ticketTypeId: ts.value, title: $('#q-title').value.trim(),
        description: $('#q-desc').value.trim(),
        dueDate: $('#q-due').value||null, subCategory, targetSystem,
        businessDomain: $('#q-biz-domain').value || null,
        itBaId: ctState.itBa?.id||null,
        consensusApproverIds: needCon ? qConApprovers.map(u=>u.id) : [],
      }});
      // 요구사항 일괄 등록 + 이미지 저장
      const createdReqs = await Promise.all(qRequirements.map(r =>
        api(`/tickets/${ticket.id}/requirements`, { method:'POST', body:{ title: r.title, description: r.description || null } })
      ));
      await Promise.allSettled(createdReqs.map(async (req, i) => {
        const qReq = qRequirements[i];
        if (!req?.id) return;
        // 이미지 저장
        if (qReq?.images?.length) {
          await Promise.allSettled(qReq.images.map(img =>
            api(`/collab/requirements/${req.id}/annotations`, {
              method: 'POST', body: { imageData: img.imageData, shapes: img.shapes || [] },
            })
          ));
        }
        // 파일 업로드
        if (qReq?.files?.length) {
          const fd = new FormData();
          qReq.files.forEach(f => fd.append('files', f));
          const token = localStorage.getItem('token');
          await fetch(`/api/collab/requirements/${req.id}/files`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
          }).catch(() => {});
        }
      }));
      // 첨부파일 업로드
      if (qFiles.length > 0) {
        const results = await Promise.allSettled(qFiles.map(f => uploadFile(ticket.id, f)));
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) toast(`${qFiles.length - failed}개 업로드 완료, ${failed}개 실패`, 'warn');
      }
      // 참조자 등록
      if (qWatchers.length > 0) {
        await api(`/tickets/${ticket.id}/watchers`, {
          method: 'POST', body: { userIds: qWatchers.map(u => u.id) },
        }).catch(() => {});
      }
      // DEV 유형: 요구사항 등록 단계 자동 제출 → 요구사항 검토 단계로 이동
      if (code === 'DEV') {
        await api(`/tickets/${ticket.id}/process`, { method: 'POST', body: { action: 'COMPLETED', comment: '요구사항 등록 완료' } }).catch(() => {});
      }
      toast('티켓이 등록되었습니다.');
      navigate('ticket-detail', { id: ticket.id });
    } catch (err) { toast(err.message,'error'); }
  });
}

// ── 티켓 상세 ─────────────────────────────────────────────
async function renderTicketDetail({ id }) {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm">불러오는 중...</div>';
  try {
    const ticket = await api(`/tickets/${id}`);
    const stages = ticket.ticketType.workflowStages;
    const currentIdx = stages.findIndex(s => s.id === ticket.currentStageId);

    el.innerHTML = `
      <div class="max-w-7xl mx-auto space-y-5">

        <!-- 헤더 -->
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <div class="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <span class="font-mono">${ticket.ticketNumber}</span>
            <span>·</span>
            <span>${ticket.ticketType.name}</span>
            <span>·</span>
            <span class="stage-badge status-${ticket.status}">${statusLabel[ticket.status]}</span>
            <span class="text-sm ${priorityColor[ticket.priority]}">● ${priorityLabel[ticket.priority]}</span>
          </div>
          <h2 class="text-xl font-bold text-gray-900 mb-3">${ticket.title}</h2>
          <div class="p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">${ticket.description}</div>
        </div>

        <!-- 워크플로우 타임라인 -->
        <div id="workflow-timeline" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div class="p-4 text-sm text-gray-400 text-center">불러오는 중...</div>
        </div>

        <!-- 2열 레이아웃 -->
        <div class="grid grid-cols-3 gap-5 items-start">

          <!-- ── 좌: 메인 영역 ── -->
          <div class="col-span-2 space-y-5">

            <!-- 요구사항 -->
            <div class="bg-white rounded-xl border ${['요구사항 등록','요구사항 검토'].includes(ticket.currentStage?.name) ? 'border-blue-400' : 'border-gray-200'} p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-800">요구사항${ticket.currentStage?.name === '요구사항 등록' ? ' <span class="text-xs text-blue-600 font-normal ml-1">(등록 단계)</span>' : ticket.currentStage?.name === '요구사항 검토' ? ' <span class="text-xs text-indigo-600 font-normal ml-1">(IT BA 검토 중)</span>' : ''}</h3>
                ${ticket.currentStage?.name === '요구사항 등록' && ticket.requesterId === currentUser.id
                  ? `<button onclick="openReqModal('${ticket.id}')" class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition">+ 요구사항 추가</button>`
                  : !['요구사항 등록','요구사항 검토'].includes(ticket.currentStage?.name)
                    ? `<button onclick="openReqModal('${ticket.id}')" class="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition">+ 요구사항 추가</button>`
                    : ''}
              </div>
              ${(() => {
                const stageName = ticket.currentStage?.name;
                if (stageName === '요구사항 등록') {
                  const returnedHistory = ticket.stageHistories?.slice().reverse()
                    .find(h => h.action === 'RETURNED' && h.stage?.name === '요구사항 검토');
                  if (returnedHistory) {
                    return `<div class="mb-4 p-3 bg-yellow-50 border border-yellow-300 rounded-lg">
                      <div class="text-xs font-semibold text-yellow-800 mb-1">↩ IT BA 보완 요청</div>
                      <div class="text-sm text-yellow-700">${returnedHistory.comment || '요구사항을 더 명확하게 작성해 주세요.'}</div>
                      <div class="text-xs text-yellow-500 mt-1">${returnedHistory.actor?.name} · ${formatDate(returnedHistory.createdAt)}</div>
                    </div>`;
                  }
                  return `<div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">요구사항을 상세히 등록한 후 제출 버튼을 눌러주세요. IT BA가 검토 후 승인하거나 보완을 요청합니다.</div>`;
                }
                if (stageName === '요구사항 검토') {
                  if (['DEVELOPER','MANAGER','ADMIN'].includes(currentUser.role)) {
                    return `<div class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">각 요구사항의 검토 상태를 설정하세요. <b>수용</b>된 요구사항부터 개발을 시작할 수 있습니다. 전체 검토가 완료되면 <b>요구사항 승인</b>으로 다음 단계로 진행하세요.</div>`;
                  }
                  return `<div class="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">IT BA가 요구사항을 검토하고 있습니다. 검토 결과는 아래 요구사항 목록에서 확인할 수 있습니다.</div>`;
                }
                return '';
              })()}
              <div id="req-list"><div class="text-sm text-gray-400">불러오는 중...</div></div>
            </div>

        <!-- 프로그램 영향도 분석 -->
        <div class="bg-white rounded-xl border border-gray-200 p-6 hidden" id="program-impact-section">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-800">프로그램 영향도 분석</h3>
            ${currentUser.role !== 'USER' ? `<button onclick="showProgramImpactForm('${ticket.id}')" class="text-xs text-indigo-700 font-medium hover:underline">+ 프로그램 추가</button>` : ''}
          </div>
          <div id="program-impact-form" class="hidden mb-4 p-4 bg-indigo-50 rounded-xl space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-500 mb-1 block">유형 *</label>
                <select id="pi-type" class="form-select w-full">
                  <option value="SCREEN">화면</option>
                  <option value="INTERFACE">인터페이스</option>
                  <option value="MODULE">모듈</option>
                  <option value="QUERY">쿼리</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-gray-500 mb-1 block">신규/수정</label>
                <select id="pi-isnew" class="form-select w-full">
                  <option value="true">신규</option>
                  <option value="false">수정</option>
                </select>
              </div>
            </div>
            <div><input id="pi-name" type="text" placeholder="프로그램명 *" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
            <div><textarea id="pi-desc" placeholder="프로그램 설명 (선택)" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"></textarea></div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-500 mb-1 block">영향도</label>
                <select id="pi-level" class="form-select w-full">
                  <option value="LOW">낮음</option>
                  <option value="MEDIUM" selected>보통</option>
                  <option value="HIGH">높음</option>
                </select>
              </div>
              <div>
                <label class="text-xs text-gray-500 mb-1 block">영향 범위</label>
                <input id="pi-scope" type="text" placeholder="영향받는 시스템/모듈" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
            </div>
            <div class="flex gap-2 justify-end">
              <button onclick="submitProgramImpact('${ticket.id}')" class="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700">저장</button>
              <button onclick="$('#program-impact-form').classList.add('hidden')" class="text-sm text-gray-500 hover:text-gray-700">취소</button>
            </div>
          </div>
          <div id="program-impact-list"><div class="text-sm text-gray-400">불러오는 중...</div></div>

          ${currentUser.role !== 'USER' ? `
          <div class="mt-5 pt-4 border-t border-gray-100" id="itba-analysis-section">
            <h4 class="text-sm font-semibold text-gray-700 mb-3">IT BA 추가 분석</h4>
            <div class="space-y-3">
              <div>
                <div class="text-xs text-gray-500 mb-1.5">외부 인터페이스 연동 수</div>
                <div class="flex gap-2" id="ext-iface-chips">
                  <button onclick="selectItbaChip('ext-iface','없음',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors">없음</button>
                  <button onclick="selectItbaChip('ext-iface','1건',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors">1건</button>
                  <button onclick="selectItbaChip('ext-iface','2건 이상',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors">2건 이상</button>
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 mb-1.5">DB 구조 변경 여부</div>
                <div class="flex gap-2" id="db-change-chips">
                  <button onclick="selectItbaChip('db-change','없음',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors">없음</button>
                  <button onclick="selectItbaChip('db-change','있음',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors">있음</button>
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 mb-1.5">대고객 서비스 여부 <span class="text-gray-400 font-normal">(홈페이지·제휴플랫폼 등 실시간 반영 필요 시)</span></div>
                <div class="flex gap-2" id="customer-facing-chips">
                  <button onclick="selectItbaChip('customer-facing','아니오',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors">해당 없음</button>
                  <button onclick="selectItbaChip('customer-facing','예',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 transition-colors">대고객 서비스</button>
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 mb-1.5">IT BA 체감 난이도 <span class="text-gray-400 font-normal">(선택 시 AI 판정을 무시하고 확정)</span></div>
                <div class="flex gap-2 flex-wrap" id="itba-override-chips">
                  <button onclick="selectItbaChip('itba-override','',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:border-gray-400 transition-colors">선택 안함</button>
                  <button data-val="LOW" onclick="selectItbaChip('itba-override','LOW',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-green-700 hover:border-green-400 transition-colors">낮음</button>
                  <button data-val="MEDIUM" onclick="selectItbaChip('itba-override','MEDIUM',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-amber-700 hover:border-amber-400 transition-colors">보통</button>
                  <button data-val="HIGH" onclick="selectItbaChip('itba-override','HIGH',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-orange-700 hover:border-orange-400 transition-colors">높음</button>
                  <button data-val="VERY_HIGH" onclick="selectItbaChip('itba-override','VERY_HIGH',this)" class="itba-chip px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-red-700 hover:border-red-400 transition-colors">매우 높음</button>
                </div>
              </div>
            </div>
            <div class="flex justify-end mt-4">
              <button id="itba-save-btn" onclick="saveItbaAnalysis('${ticket.id}')" class="inline-flex items-center gap-2 bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">난이도 재산정</button>
            </div>
            <div id="itba-result" class="hidden mt-3"></div>
          </div>
          ` : ''}
        </div>

            <!-- 테스트 관리 -->
            <div class="bg-white rounded-xl border border-gray-200 p-6 hidden" id="test-section">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold text-gray-800">테스트 케이스</h3>
            ${currentUser.role !== 'USER' ? `<button onclick="showTestCaseForm('${ticket.id}')" class="text-xs text-blue-700 font-medium hover:underline">+ 케이스 추가</button>` : ''}
          </div>
          <div id="test-case-form" class="hidden mb-4 p-4 bg-blue-50 rounded-xl space-y-3">
            <div><input id="tc-title" type="text" placeholder="케이스 제목 *" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" /></div>
            <div><textarea id="tc-preconditions" placeholder="사전 조건 (선택)" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"></textarea></div>
            <div><textarea id="tc-steps" placeholder="테스트 단계 * (단계별로 줄바꿈)" rows="3" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"></textarea></div>
            <div><textarea id="tc-expected" placeholder="기대 결과 *" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"></textarea></div>
            <div class="flex items-center gap-2">
              <select id="tc-priority" class="form-select flex-1">
                <option value="LOW">낮음</option>
                <option value="MEDIUM" selected>보통</option>
                <option value="HIGH">높음</option>
                <option value="CRITICAL">긴급</option>
              </select>
              <button onclick="submitTestCase('${ticket.id}')" class="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">저장</button>
              <button onclick="$('#test-case-form').classList.add('hidden')" class="text-sm text-gray-500 hover:text-gray-700">취소</button>
            </div>
          </div>
          <div id="test-case-list"><div class="text-sm text-gray-400">불러오는 중...</div></div>
        </div>


            <!-- 운영 이관 -->
            <div class="bg-white rounded-xl border border-gray-200 p-6" id="deploy-section">
              <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-800">운영 이관</h3>
                <span id="deploy-status-badge"></span>
              </div>
              <div id="deploy-content"><div class="text-sm text-gray-400">불러오는 중...</div></div>
            </div>

            <!-- 댓글 -->
            <div class="bg-white rounded-xl border border-gray-200 p-6">
              <h3 class="font-semibold text-gray-800 mb-4">댓글 (${ticket.comments.length})</h3>
              <div class="space-y-3 mb-4">
                ${ticket.comments.map(c => `
                  <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">${c.user.name[0]}</div>
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-0.5">
                        <span class="text-sm font-medium">${c.user.name}</span>
                        <span class="text-xs text-gray-400">${formatDate(c.createdAt)}</span>
                      </div>
                      <div class="text-sm text-gray-700">${c.content}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
              <div class="flex gap-2">
                <textarea id="comment-input" rows="2" placeholder="댓글을 입력하세요..." class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
                <button onclick="submitComment('${ticket.id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg text-sm transition self-end py-2">등록</button>
              </div>
            </div>

          </div><!-- /col-span-2 -->

          <!-- ── 우: 사이드바 ── -->
          <div class="col-span-1 space-y-4">

            <!-- 난이도 카드 -->
            ${(ticket.aiEstimatedDifficulty || ticket.finalDifficulty) ? (() => {
              const diff = ticket.finalDifficulty || ticket.aiEstimatedDifficulty;
              const isFinal = !!ticket.finalDifficulty;
              const colorClass = DIFFICULTY_COLOR[diff] || 'text-gray-600 bg-gray-50';
              const borderClass = diff==='VERY_HIGH'?'border-red-300 bg-red-50':diff==='HIGH'?'border-orange-300 bg-orange-50':diff==='MEDIUM'?'border-amber-300 bg-amber-50':'border-green-300 bg-green-50';
              return `
            <div id="difficulty-card" class="rounded-xl border p-4 ${borderClass}">
              <div class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">개발 난이도</div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs text-gray-400">${isFinal ? '확정' : 'AI 예측'}</span>
                <span class="px-2.5 py-0.5 rounded-lg text-sm font-bold ${colorClass}">${DIFFICULTY_LABEL[diff]||diff}</span>
                ${ticket.aiEstimatedDays ? `<span class="text-xs text-gray-500">예상 ${ticket.aiEstimatedDays}</span>` : ''}
              </div>
              ${ticket.aiDifficultyReason ? `<div class="text-xs text-gray-500 leading-relaxed mt-1">${ticket.aiDifficultyReason}</div>` : ''}
            </div>`;
            })() : ''}

            <!-- 티켓 메타 정보 -->
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">티켓 정보</h3>
              <div class="space-y-2.5 text-sm">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0">상태</span>
                  <span class="stage-badge status-${ticket.status}">${statusLabel[ticket.status]}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0">우선순위</span>
                  <span class="font-medium ${priorityColor[ticket.priority]}">● ${priorityLabel[ticket.priority]}</span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">요청자</span>
                  <span class="font-medium text-gray-800">${ticket.requester.name} <span class="text-xs text-gray-400">(${ticket.requester.department?.name || '-'})</span></span>
                </div>
                <div class="flex items-start gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">등록일</span>
                  <span class="text-gray-700">${formatDate(ticket.createdAt)}</span>
                </div>
                ${ticket.dueDate ? `
                <div class="flex items-start gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">완료 희망일</span>
                  <span class="font-medium text-gray-800">${formatDate(ticket.dueDate)}</span>
                </div>` : ''}
                ${ticket.businessDomain ? `
                <div class="flex items-start gap-2 pt-1 border-t border-gray-50">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">업무 도메인</span>
                  <span class="font-medium text-gray-800">${ticket.businessDomain}</span>
                </div>` : ''}
                ${ticket.subCategory ? `
                <div class="flex items-start gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">요청구분</span>
                  <span class="font-medium text-gray-800">${ticket.subCategory}</span>
                </div>` : ''}
                ${ticket.targetSystem ? `
                <div class="flex items-start gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">대상 시스템</span>
                  <span class="font-medium text-gray-800">${ticket.targetSystem}</span>
                </div>` : ''}
                ${ticket.itBa ? `
                <div class="flex items-start gap-2 pt-1 border-t border-gray-50">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">IT BA</span>
                  <span class="font-medium text-gray-800">${ticket.itBa.name}</span>
                </div>` : ''}
                ${ticket.manager ? `
                <div class="flex items-start gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">IT 책임자</span>
                  <span class="font-medium text-gray-800">${ticket.manager.name}</span>
                </div>` : ''}
                ${ticket.developers?.length ? `
                <div class="flex items-start gap-2">
                  <span class="text-xs text-gray-400 w-20 shrink-0 pt-0.5">담당 개발자</span>
                  <div class="flex flex-wrap gap-1">
                    ${ticket.developers.map(d => `<span class="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">${d.user.name}</span>`).join('')}
                  </div>
                </div>` : ''}
              </div>
            </div>

            <!-- 참조자 -->
            <div class="bg-white rounded-xl border border-gray-200 p-4" id="watcher-section">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">참조자</h3>
                <button onclick="toggleWatcherAdd('${ticket.id}')" class="text-xs text-yellow-700 font-medium hover:underline">+ 추가</button>
              </div>
              <div id="watcher-add-box" class="hidden mb-3">
                <div class="relative">
                  <div class="form-input flex items-center gap-2 flex-wrap cursor-text min-h-[40px]" onclick="document.getElementById('watcher-search-inp').focus()">
                    <input id="watcher-search-inp" type="text" placeholder="이름으로 검색..." autocomplete="off" class="flex-1 outline-none text-sm bg-transparent min-w-[120px]" />
                  </div>
                  <div id="watcher-search-dd" class="hidden search-dropdown"><div id="watcher-search-res"></div></div>
                </div>
              </div>
              <div id="watcher-list">
                ${ticket.watchers?.length
                  ? ticket.watchers.map(w => `
                      <div class="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0" data-watcher-id="${w.userId}">
                        <div class="flex items-center gap-2">
                          <div class="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center text-xs font-bold text-yellow-700 shrink-0">${w.user.name[0]}</div>
                          <div>
                            <div class="text-sm font-medium text-gray-800">${w.user.name}</div>
                            <div class="text-xs text-gray-400">${w.user.department?.name || roleLabel[w.user.role]}</div>
                          </div>
                        </div>
                        <button onclick="removeWatcher('${ticket.id}','${w.userId}')" class="text-xs text-gray-300 hover:text-red-500 px-1">✕</button>
                      </div>`).join('')
                  : '<div class="text-sm text-gray-400" id="watcher-empty">참조자가 없습니다.</div>'}
              </div>
            </div>

            <!-- 연관 티켓 -->
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">연관 티켓</h3>
                <button onclick="toggleRelationAdd('${ticket.id}')" class="text-xs text-green-700 font-medium hover:underline">+ 연결</button>
              </div>
              <div id="relation-add-box" class="hidden mb-3 space-y-2">
                <select id="relation-type-sel" class="form-select w-full text-xs">
                  <option value="RELATED_TO">연관</option>
                  <option value="PARENT_OF">상위</option>
                  <option value="CHILD_OF">하위</option>
                  <option value="DUPLICATES">중복</option>
                  <option value="BLOCKED_BY">블로킹</option>
                </select>
                <div class="relative">
                  <input id="relation-search" type="text" placeholder="티켓 번호 또는 제목..."
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
                  <div id="relation-dd" class="hidden search-dropdown"></div>
                </div>
              </div>
              <div id="relation-list">
                ${ticket.relations.length === 0
                  ? '<div class="text-sm text-gray-400">연관 티켓 없음</div>'
                  : ticket.relations.map(r => `
                      <div class="flex items-start justify-between py-2 border-b border-gray-50 last:border-0 gap-1">
                        <div class="flex flex-col gap-0.5 min-w-0">
                          <div class="flex items-center gap-1">
                            <span class="relation-badge relation-${r.relationType} shrink-0">${relationLabel[r.relationType]}</span>
                            <button onclick="navigate('ticket-detail',{id:'${r.relatedTicket.id}'})"
                              class="font-mono text-xs text-gray-500 hover:text-green-700 shrink-0">${r.relatedTicket.ticketNumber}</button>
                          </div>
                          <span class="text-xs text-gray-700 truncate">${r.relatedTicket.title}</span>
                          <span class="stage-badge status-${r.relatedTicket.status} w-fit">${statusLabel[r.relatedTicket.status]}</span>
                        </div>
                        <button onclick="removeRelation('${ticket.id}','${r.relatedTicketId}','${ticket.id}')"
                          class="text-xs text-gray-300 hover:text-red-500 shrink-0 px-1">✕</button>
                      </div>`).join('')}
              </div>
            </div>

            <!-- 첨부파일 -->
            <div class="bg-white rounded-xl border border-gray-200 p-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-xs font-semibold text-gray-400 uppercase tracking-wider">첨부파일 (${ticket.attachments.length})</h3>
                <label class="text-xs text-blue-700 font-medium hover:underline cursor-pointer">
                  + 추가<input type="file" multiple class="hidden" onchange="uploadAttachments(event,'${ticket.id}')"/>
                </label>
              </div>
              ${ticket.attachments.length ? `
                <div class="space-y-1.5">
                  ${ticket.attachments.map(a => `
                    <div class="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
                      <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                      <a href="/uploads/${a.filePath.split('/').pop()}" target="_blank" class="flex-1 text-xs text-blue-600 hover:underline truncate">${a.fileName}</a>
                      <span class="text-xs text-gray-400 shrink-0">${formatFileSize(a.fileSize)}</span>
                    </div>`).join('')}
                </div>
              ` : '<div class="text-sm text-gray-400">없음</div>'}
            </div>

          </div><!-- /col-span-1 sidebar -->

        </div><!-- /grid -->
      </div><!-- /max-w-7xl -->
    `;
    setupRelationSearch(ticket.id);
    setupAssigneeSearch();
    setupManagerSearch();

    const allStages = ticket.ticketType?.workflowStages || [];
    const currentStageOrder = ticket.currentStage?.stageOrder ?? 0;
    const currentActionType = ticket.currentStage?.actionType;
    const isCompleted = ticket.status === 'COMPLETED';

    loadRequirements(ticket.id, currentActionType === 'COLLABORATE' || isCompleted);
    loadWorkflowTimeline(ticket.id);

    // 프로그램 영향도 분석 · 테스트 케이스: 1단계(요구사항 협의)부터 표시
    // IT BA가 요구사항 협의 중 구현 대상 프로그램 식별 및 테스트케이스 도출
    const collaborateStageOrder = allStages.find(s => s.actionType === 'COLLABORATE')?.stageOrder ?? 1;
    const showFromCollaborate = isCompleted || currentStageOrder >= collaborateStageOrder;

    const programImpactSection = $('#program-impact-section');
    if (programImpactSection) {
      const isItba = ['DEVELOPER', 'MANAGER', 'ADMIN'].includes(currentUser.role);
      if (showFromCollaborate && isItba) {
        programImpactSection.classList.remove('hidden');
        loadProgramImpacts(ticket.id);
        initItbaForm(ticket);
      } else {
        programImpactSection.classList.add('hidden');
      }
    }

    const testSection = $('#test-section');
    if (testSection) {
      if (showFromCollaborate) {
        testSection.classList.remove('hidden');
        loadTestCases(ticket.id);
      } else {
        testSection.classList.add('hidden');
      }
    }

    loadDeployment(ticket);
  } catch (err) {
    el.innerHTML = `<div class="text-red-500">${err.message}</div>`;
  }
}

function toggleRelationAdd(ticketId) {
  const box = $('#relation-add-box');
  if (!box) return;
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) {
    setupRelationSearch(ticketId);
    $('#relation-search')?.focus();
  }
}

function setupRelationSearch(ticketId) {
  const input = $('#relation-search'), dd = $('#relation-dd');
  if (!input || !dd) return;
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { dd.classList.add('hidden'); return; }
    timer = setTimeout(async () => {
      try {
        const tickets = await api(`/tickets/search?q=${encodeURIComponent(q)}`);
        dd.innerHTML = tickets.length
          ? tickets.map(t => `
              <div class="search-result-item" data-id="${t.id}" data-num="${t.ticketNumber}" data-title="${t.title.replace(/"/g,'&quot;')}">
                <div class="flex-1">
                  <div class="text-sm font-medium">${t.title}</div>
                  <div class="text-xs text-gray-400">${t.ticketNumber} · ${t.ticketType?.name||''}</div>
                </div>
                <span class="stage-badge status-${t.status} shrink-0">${statusLabel[t.status]}</span>
              </div>`).join('')
          : '<div class="px-4 py-3 text-sm text-gray-400">검색 결과가 없습니다.</div>';
        dd.querySelectorAll('[data-id]').forEach(item =>
          item.addEventListener('click', async () => {
            const relType = $('#relation-type-sel')?.value || 'RELATED_TO';
            try {
              await api(`/tickets/${ticketId}/relations`, { method:'POST', body:{ relatedTicketId:item.dataset.id, relationType:relType } });
              toast('연관 티켓이 추가되었습니다.');
              renderTicketDetail({ id: ticketId });
            } catch (err) { toast(err.message, 'error'); }
          })
        );
        dd.classList.remove('hidden');
      } catch {}
    }, 280);
  });
  document.addEventListener('click', e => { if (!input.closest('.relative')?.contains(e.target)) dd.classList.add('hidden'); });
}

async function removeRelation(ticketId, relatedId) {
  try {
    await api(`/tickets/${ticketId}/relations/${relatedId}`, { method:'DELETE' });
    toast('연관이 해제되었습니다.');
    renderTicketDetail({ id: ticketId });
  } catch (err) { toast(err.message, 'error'); }
}

// ── 참조자 관리 ────────────────────────────────────────────

function toggleWatcherAdd(ticketId) {
  const box = $('#watcher-add-box');
  if (!box) return;
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden') && !box.dataset.init) {
    setupWatcherSearch(ticketId);
    box.dataset.init = '1';
    $('#watcher-search-inp')?.focus();
  }
}

function setupWatcherSearch(ticketId) {
  const input = $('#watcher-search-inp'), dd = $('#watcher-search-dd');
  if (!input || !dd) return;
  chatSetupUserDD('#watcher-search-inp', '#watcher-search-dd', '/common/users/all', async user => {
    try {
      await api(`/tickets/${ticketId}/watchers`, { method: 'POST', body: { userIds: [user.id] } });
      toast(`${user.name}을(를) 참조자로 추가했습니다.`);
      input.value = ''; dd.classList.add('hidden');
      // update list in-place
      const list = $('#watcher-list');
      const empty = document.getElementById('watcher-empty');
      if (empty) empty.remove();
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0';
      row.dataset.watcherId = user.id;
      row.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center text-xs font-bold text-yellow-700 shrink-0">${user.name[0]}</div>
          <div>
            <div class="text-sm font-medium text-gray-800">${user.name}</div>
            <div class="text-xs text-gray-400">${user.department?.name || roleLabel[user.role] || user.role}</div>
          </div>
        </div>
        <button onclick="removeWatcher('${ticketId}','${user.id}')" class="text-xs text-gray-300 hover:text-red-500 px-2 py-1">✕</button>`;
      if (list) list.appendChild(row);
    } catch (err) { toast(err.message, 'error'); }
  });
}

async function removeWatcher(ticketId, userId) {
  try {
    await api(`/tickets/${ticketId}/watchers/${userId}`, { method: 'DELETE' });
    toast('참조자가 삭제되었습니다.');
    const row = document.querySelector(`[data-watcher-id="${userId}"]`);
    if (row) row.remove();
    const list = $('#watcher-list');
    if (list && !list.querySelector('[data-watcher-id]')) {
      list.innerHTML = '<div class="text-sm text-gray-400" id="watcher-empty">참조자가 없습니다.</div>';
    }
  } catch (err) { toast(err.message, 'error'); }
}

// ── 요구사항 관리 ─────────────────────────────────────────

const reqStatusLabel = { ACTIVE:'진행중', COMPLETED:'완료', CANCELLED:'취소' };
const reqStatusColor = { ACTIVE:'bg-blue-100 text-blue-700', COMPLETED:'bg-green-100 text-green-700', CANCELLED:'bg-gray-100 text-gray-400 line-through' };

const reviewStatusLabel = { PENDING:'검토 대기', REVIEWING:'검토 중', ACCEPTED:'수용', NEGOTIATING:'협의 중', DEFERRED:'보류', REJECTED:'불가' };
const reviewStatusColor = {
  PENDING:    'bg-gray-100 text-gray-500',
  REVIEWING:  'bg-blue-100 text-blue-700',
  ACCEPTED:   'bg-green-100 text-green-700',
  NEGOTIATING:'bg-yellow-100 text-yellow-700',
  DEFERRED:   'bg-orange-100 text-orange-600',
  REJECTED:   'bg-red-100 text-red-600',
};

function calcReviewAggregate(reqs) {
  const active = reqs.filter(r => r.status !== 'CANCELLED');
  if (!active.length) return null;
  const counts = {};
  for (const r of active) counts[r.reviewStatus] = (counts[r.reviewStatus] || 0) + 1;
  const accepted = counts.ACCEPTED || 0;
  const total = active.length;
  if (active.every(r => r.reviewStatus === 'PENDING')) return null;
  if (accepted === total) return { label: '✅ 전체 수용', color: 'bg-green-100 text-green-800 border-green-300' };
  if (counts.NEGOTIATING)  return { label: `💬 요구사항 협의 중`, color: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
  if (accepted > 0)        return { label: `⚡ 부분 수용 (${accepted}/${total})`, color: 'bg-blue-100 text-blue-800 border-blue-300' };
  if (counts.REVIEWING)    return { label: '🔍 검토 중', color: 'bg-indigo-100 text-indigo-800 border-indigo-300' };
  return null;
}

async function loadRequirements(ticketId, showAnnotation = true) {
  const el = $('#req-list');
  if (!el) return;
  try {
    const reqs = await api(`/tickets/${ticketId}/requirements`);
    if (!reqs.length) { el.innerHTML = '<div class="text-sm text-gray-400">등록된 요구사항이 없습니다.</div>'; return; }

    const completed = reqs.filter(r => r.status === 'COMPLETED').length;
    const total = reqs.filter(r => r.status !== 'CANCELLED').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const agg = calcReviewAggregate(reqs);

    // IT BA 검토 단계 여부 (현재 열려있는 티켓 컨텍스트에서 판단)
    const isItbaReviewStage = !!document.querySelector('[data-stage-name="요구사항 검토"]');
    const canSetReview = ['DEVELOPER','MANAGER','ADMIN'].includes(currentUser.role);

    el.innerHTML = `
      <div class="mb-3 space-y-2">
        ${agg ? `<div class="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold ${agg.color}">${agg.label}</div>` : ''}
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span>완료 ${completed} / ${total}건</span>
          <span class="font-semibold ${pct === 100 ? 'text-green-600' : 'text-blue-600'}">${pct}%</span>
        </div>
        <div class="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'} transition-all" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="space-y-2">
        ${reqs.map(r => {
          const hasAnnotations = r.annotations && r.annotations.length > 0;
          const isCancelled = r.status === 'CANCELLED';
          const reviewBadge = !isCancelled
            ? `<span class="text-xs px-2 py-0.5 rounded-full font-medium ${reviewStatusColor[r.reviewStatus] || 'bg-gray-100 text-gray-400'} shrink-0">${reviewStatusLabel[r.reviewStatus] || r.reviewStatus}</span>`
            : '';
          const reviewNote = r.reviewNote
            ? `<div class="px-4 pb-2 text-xs text-gray-500 italic">"${r.reviewNote}"</div>`
            : '';
          const reviewButtons = canSetReview && !isCancelled ? `
            <div class="px-4 pb-3 flex flex-wrap gap-1.5" onclick="event.stopPropagation()">
              ${[
                ['REVIEWING',  '검토 중',  'text-blue-600 border-blue-200 hover:bg-blue-50'],
                ['ACCEPTED',   '수용',     'text-green-600 border-green-200 hover:bg-green-50'],
                ['NEGOTIATING','협의 중',  'text-yellow-700 border-yellow-200 hover:bg-yellow-50'],
                ['DEFERRED',   '보류',     'text-orange-600 border-orange-200 hover:bg-orange-50'],
                ['REJECTED',   '불가',     'text-red-600 border-red-200 hover:bg-red-50'],
              ].map(([val, label, cls]) => `
                <button onclick="setReviewStatus('${r.id}','${ticketId}','${val}')"
                  class="text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${cls} ${r.reviewStatus === val ? 'ring-2 ring-offset-1 ring-current' : ''}">
                  ${label}
                </button>`).join('')}
            </div>` : '';
          return `
          <div class="border ${isCancelled ? 'border-gray-100' : reviewStatusBorder(r.reviewStatus)} rounded-xl overflow-hidden group transition-colors">
            <div class="flex items-center gap-3 px-4 py-3 ${isCancelled ? 'bg-gray-50' : 'bg-white hover:bg-gray-50/60'} cursor-pointer transition-colors"
              onclick="openReqDetailModal('${r.id}','${ticketId}')">
              <span class="text-xs px-2 py-0.5 rounded font-medium ${reqStatusColor[r.status]} shrink-0">${reqStatusLabel[r.status]}</span>
              ${reviewBadge}
              <span class="flex-1 text-sm font-medium ${isCancelled ? 'text-gray-400 line-through' : 'text-gray-800'}">${r.title}</span>
              <span class="text-xs text-gray-300 shrink-0">v${r.version}</span>
              ${hasAnnotations ? `<span class="text-xs text-indigo-500 font-medium shrink-0">🖼️ ${r.annotations.length}장</span>` : ''}
              ${showAnnotation && currentUser.role !== 'USER' && !isCancelled ? `
              <button id="ai-tc-btn-${r.id}"
                onclick="event.stopPropagation(); aiGenerateTestCases('${r.id}','${ticketId}', this)"
                class="shrink-0 text-xs px-2 py-1 rounded-lg bg-violet-50 text-violet-600 border border-violet-200 hover:bg-violet-100 transition-colors font-medium">
                ✨ AI 생성
              </button>` : ''}
              <span class="text-xs text-gray-400 group-hover:text-blue-500 shrink-0">→</span>
            </div>
            ${reviewNote}
            ${reviewButtons}
          </div>`;
        }).join('')}
      </div>`;
  } catch (err) { el.innerHTML = `<div class="text-red-500 text-sm">${err.message}</div>`; }
}

function reviewStatusBorder(rs) {
  return { ACCEPTED:'border-green-200', NEGOTIATING:'border-yellow-200', REVIEWING:'border-blue-200', DEFERRED:'border-orange-200', REJECTED:'border-red-200' }[rs] || 'border-gray-100';
}

async function setReviewStatus(reqId, ticketId, reviewStatus) {
  let reviewNote = null;
  if (reviewStatus === 'REJECTED' || reviewStatus === 'DEFERRED') {
    reviewNote = prompt(reviewStatus === 'REJECTED' ? '불가 사유를 입력하세요 (선택)' : '보류 사유를 입력하세요 (선택)');
    if (reviewNote === null) return; // 취소
  }
  try {
    await api(`/tickets/requirements/${reqId}/review-status`, {
      method: 'PATCH',
      body: { reviewStatus, reviewNote: reviewNote || null },
    });
    loadRequirements(ticketId, true);
  } catch (err) { toast(err.message, 'error'); }
}

async function aiGenerateTestCases(reqId, ticketId, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<svg class="animate-spin h-3 w-3 inline mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>생성 중...`;
  try {
    const created = await api(`/tests/tickets/${ticketId}/ai-test-cases`, {
      method: 'POST',
      body: { requirementId: reqId },
    });
    toast(`테스트 케이스 ${created.length}건이 생성되었습니다.`);

    const testSection = document.getElementById('test-section');
    if (testSection?.classList.contains('hidden')) {
      testSection.classList.remove('hidden');
    }
    loadTestCases(ticketId);

    document.getElementById('test-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

// ─── 요구사항 모달 ────────────────────────────────────────────────────────────

let _currentActionType = null;
function _isCollaborateActive() {
  return _currentActionType === 'COLLABORATE';
}

let _reqModalImages = []; // { imageData, shapes }[]
let _reqModalTicketId = null;
let _reqModalEditId = null; // null=create, id=edit

function openReqModal(ticketId, existingReq = null) {
  try {
  _reqModalImages = [];
  _reqModalTicketId = ticketId;
  _reqModalEditId = existingReq?.id || null;

  const isEdit = !!existingReq;
  const modal = document.createElement('div');
  modal.id = 'req-modal';
  modal.className = 'fixed inset-0 bg-black/60 z-40 flex items-start justify-center p-4 overflow-y-auto';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h3 class="text-lg font-bold text-gray-800">${isEdit ? '요구사항 수정' : '요구사항 추가'}</h3>
        <button onclick="closeReqModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">제목 <span class="text-red-500">*</span></label>
          <input id="req-modal-title" type="text" value="${isEdit ? existingReq.title.replace(/"/g,'&quot;') : ''}"
            placeholder="요구사항 제목을 입력하세요"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">설명</label>
          <textarea id="req-modal-desc" rows="4" placeholder="요구사항에 대한 상세 설명을 입력하세요 (선택)"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none">${isEdit && existingReq.description ? existingReq.description : ''}</textarea>
        </div>
        ${isEdit ? `
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">변경 사유</label>
          <input id="req-modal-note" type="text" placeholder="변경 사유를 입력하세요 (선택)"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>` : ''}
        <div>
          <label class="text-sm font-medium text-gray-700 mb-2 block">이미지 첨부</label>
          <p class="text-xs text-gray-400 mb-2">이미지 도구를 사용해 화면 모형·스크린샷에 도형/텍스트를 그려 추가할 수 있습니다. 여러 장 추가 가능합니다.</p>
          <button type="button" onclick="addReqModalImage()"
            class="flex items-center gap-1.5 text-sm bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-lg font-medium transition">
            🖼️ 이미지 도구로 추가
          </button>
          <div id="req-modal-images" class="mt-3 grid grid-cols-3 gap-2"></div>
        </div>
        <div>
          <label class="text-sm font-medium text-gray-700 mb-1 block">파일 첨부 <span class="text-xs text-gray-400">(최대 20개)</span></label>
          <input type="file" id="req-modal-files" multiple
            class="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-lg p-1" />
          <div id="req-modal-file-names" class="mt-1 text-xs text-blue-600 space-y-0.5"></div>
        </div>
      </div>
      <div class="flex gap-3 justify-end px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
        <button onclick="closeReqModal()" class="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100">취소</button>
        <button onclick="submitReqModal()" class="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition">${isEdit ? '수정 저장' : '요구사항 추가'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeReqModal(); });

  const fileInput = document.getElementById('req-modal-files');
  if (fileInput) fileInput.addEventListener('change', () => {
    const names = document.getElementById('req-modal-file-names');
    if (names) names.innerHTML = Array.from(fileInput.files).map(f =>
      `<div>✓ ${f.name} <span class="text-gray-400">(${formatFileSize(f.size)})</span></div>`).join('');
  });

  setTimeout(() => document.getElementById('req-modal-title')?.focus(), 50);
  } catch(err) { console.error('[openReqModal]', err); toast('요구사항 모달 오류: ' + err.message, 'error'); }
}

function closeReqModal() {
  document.getElementById('req-modal')?.remove();
  _reqModalImages = [];
}

function addReqModalImage() {
  _pendingAnnotation = null;
  const idx = _reqModalImages.length;
  window._qAnnotCallback = (imageData, shapes) => {
    _reqModalImages.push({ imageData, shapes });
    window._qAnnotCallback = null;
    renderReqModalImages();
  };
  openAnnotationModal(null, `요구사항 이미지 ${idx + 1}`);
}

function removeReqModalImage(idx) {
  _reqModalImages.splice(idx, 1);
  renderReqModalImages();
}

function renderReqModalImages() {
  const el = document.getElementById('req-modal-images');
  if (!el) return;
  if (!_reqModalImages.length) { el.innerHTML = ''; return; }
  el.innerHTML = _reqModalImages.map((img, i) => `
    <div class="relative group rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
      <img src="${img.imageData}" class="w-full h-28 object-cover cursor-pointer" onclick="viewReqModalImage(${i})" />
      <button onclick="removeReqModalImage(${i})"
        class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
      <div class="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs text-center py-0.5">${i + 1}번 이미지</div>
    </div>
  `).join('');
}

function viewReqModalImage(idx) {
  const img = _reqModalImages[idx];
  if (!img) return;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4';
  overlay.innerHTML = `
    <div class="relative max-w-4xl w-full">
      <button onclick="this.closest('.fixed').remove()" class="absolute -top-8 right-0 text-white text-2xl leading-none hover:text-gray-300">✕</button>
      <img src="${img.imageData}" class="w-full rounded-xl shadow-2xl" />
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function submitReqModal() {
  const title = document.getElementById('req-modal-title')?.value.trim();
  const description = document.getElementById('req-modal-desc')?.value.trim();
  const changeNote = document.getElementById('req-modal-note')?.value.trim();
  const fileInput = document.getElementById('req-modal-files');
  if (!title) { toast('요구사항 제목을 입력해주세요.', 'error'); return; }

  try {
    let reqId = _reqModalEditId;

    if (!reqId) {
      // 신규 생성
      const created = await api(`/tickets/${_reqModalTicketId}/requirements`, {
        method: 'POST', body: { title, description },
      });
      reqId = created.id;
    } else {
      // 수정
      await api(`/tickets/requirements/${reqId}`, {
        method: 'PUT', body: { title, description, changeNote },
      });
    }

    // 이미지 저장 (각각 CREATE)
    for (const img of _reqModalImages) {
      await api(`/collab/requirements/${reqId}/annotations`, {
        method: 'POST', body: { imageData: img.imageData, shapes: img.shapes },
      });
    }

    // 파일 업로드
    if (fileInput && fileInput.files.length > 0) {
      const fd = new FormData();
      Array.from(fileInput.files).forEach(f => fd.append('files', f));
      const token = localStorage.getItem('token');
      await fetch(`/api/collab/requirements/${reqId}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
    }

    toast(_reqModalEditId ? '요구사항이 수정되었습니다.' : '요구사항이 추가되었습니다.');
    closeReqModal();
    loadRequirements(_reqModalTicketId, _isCollaborateActive());
    if (_isCollaborateActive()) loadWorkflowTimeline(_reqModalTicketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function changeReqStatus(reqId, status, ticketId) {
  const note = status === 'CANCELLED' ? prompt('취소 사유를 입력하세요 (선택):') : null;
  if (status === 'CANCELLED' && note === null) return;
  try {
    await api(`/tickets/requirements/${reqId}/status`, {
      method: 'PATCH',
      body: { status, changeNote: note },
    });
    toast(`요구사항이 ${reqStatusLabel[status]}로 변경되었습니다.`);
    loadRequirements(ticketId, _isCollaborateActive());
  } catch (err) { toast(err.message, 'error'); }
}

// ─── 요구사항 상세 팝업 ──────────────────────────────────────────────────────

async function openReqDetailModal(reqId, ticketId) {
  // 모달 스켈레톤 먼저 열기
  const modal = document.createElement('div');
  modal.id = 'req-detail-modal';
  modal.className = 'fixed inset-0 bg-black/60 z-40 flex items-start justify-center p-4 overflow-y-auto';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h3 class="text-lg font-bold text-gray-800" id="req-detail-title">불러오는 중...</h3>
        <button onclick="document.getElementById('req-detail-modal')?.remove()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
      </div>
      <div id="req-detail-body" class="px-6 py-5">
        <div class="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
      </div>
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  try {
    const [reqs, annotations, files, comments] = await Promise.all([
      api(`/tickets/${ticketId}/requirements`),
      api(`/collab/requirements/${reqId}/annotations`),
      api(`/collab/requirements/${reqId}/files`),
      api(`/tickets/requirements/${reqId}/comments`),
    ]);
    const req = reqs.find(r => r.id === reqId);
    if (!req) { document.getElementById('req-detail-modal')?.remove(); toast('요구사항을 찾을 수 없습니다.', 'error'); return; }

    document.getElementById('req-detail-title').textContent = req.title;

    const canEdit = req.status === 'ACTIVE';
    const imgGrid = annotations.length ? `
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
        ${annotations.map((a, i) => `
          <div class="relative group rounded-xl overflow-hidden border border-gray-200 cursor-pointer" onclick="viewReqDetailImage('${a.id}',${i})">
            <img src="${a.imageData}" class="w-full h-32 object-cover" />
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
              <span class="text-white text-sm opacity-0 group-hover:opacity-100 font-medium">🔍 확대</span>
            </div>
            <div class="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs text-center py-0.5">${i + 1}번 이미지</div>
            ${canEdit ? `<button onclick="event.stopPropagation();deleteReqAnnotation('${a.id}','${reqId}','${ticketId}')"
              class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>` : ''}
          </div>`).join('')}
      </div>` : '<div class="text-xs text-gray-400 mt-2">첨부된 이미지가 없습니다.</div>';

    const fileList = files.length ? `
      <div class="space-y-1 mt-2">
        ${files.map(f => `
          <a href="/api/collab/requirement-files/${f.id}/download" target="_blank"
            class="flex items-center gap-2 text-xs bg-gray-50 hover:bg-blue-50 border border-gray-100 text-blue-600 px-3 py-1.5 rounded-lg transition">
            📎 ${f.originalName} <span class="text-gray-400">(${formatFileSize(f.size)})</span>
            <span class="text-gray-300 ml-auto">${f.uploadedBy.name}</span>
          </a>`).join('')}
      </div>` : '<div class="text-xs text-gray-400 mt-2">첨부된 파일이 없습니다.</div>';

    const historyList = req.histories.length ? `
      <div class="space-y-1 mt-2">
        ${req.histories.map(h => `
          <div class="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0 text-xs">
            <span class="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono shrink-0">v${h.version}</span>
            <div class="flex-1 min-w-0">
              <div class="text-gray-700 font-medium">${h.title}</div>
              ${h.changeNote ? `<div class="text-gray-400">${h.changeNote}</div>` : ''}
            </div>
            <span class="text-gray-300 shrink-0">${h.changedBy.name} · ${formatDate(h.changedAt)}</span>
          </div>`).join('')}
      </div>` : '<div class="text-xs text-gray-400 mt-2">변경 이력이 없습니다.</div>';

    document.getElementById('req-detail-body').innerHTML = `
      <div class="space-y-5">
        <!-- 기본 정보 -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs px-2.5 py-1 rounded-full font-medium ${reqStatusColor[req.status]}">${reqStatusLabel[req.status]}</span>
          <span class="text-xs px-2.5 py-1 rounded-full font-medium border ${reviewStatusColor[req.reviewStatus] || 'bg-gray-100 text-gray-500'}">${reviewStatusLabel[req.reviewStatus] || req.reviewStatus}</span>
          ${req.reviewNote ? `<span class="text-xs text-gray-500 italic">"${req.reviewNote}"</span>` : ''}
          <span class="text-xs text-gray-400">v${req.version}</span>
          <span class="text-xs text-gray-400">등록: ${req.createdBy.name} · ${formatDate(req.createdAt)}</span>
        </div>

        ${req.description ? `
        <div>
          <div class="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wide">설명</div>
          <div class="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-xl px-4 py-3 leading-relaxed">${req.description}</div>
        </div>` : ''}

        <!-- 이미지 -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <div class="text-xs text-gray-400 font-medium uppercase tracking-wide">첨부 이미지 (${annotations.length}장)</div>
            ${canEdit ? `<button onclick="addImageToReq('${reqId}','${ticketId}')" class="text-xs text-indigo-600 hover:underline font-medium">+ 이미지 추가</button>` : ''}
          </div>
          ${imgGrid}
        </div>

        <!-- 파일 -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <div class="text-xs text-gray-400 font-medium uppercase tracking-wide">첨부 파일 (${files.length}개)</div>
            ${canEdit ? `<label class="text-xs text-blue-600 hover:underline font-medium cursor-pointer">+ 파일 추가<input type="file" multiple class="hidden" onchange="uploadFilesToReq('${reqId}','${ticketId}',this)" /></label>` : ''}
          </div>
          ${fileList}
        </div>

        <!-- 변경 이력 -->
        <div>
          <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">변경 이력 (${req.histories.length}건)</div>
          ${historyList}
        </div>

        <!-- 의견 -->
        <div class="border-t border-gray-100 pt-4">
          <div class="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">의견 (${comments.length})</div>
          <div id="req-comments-list" class="space-y-3 mb-3">
            ${comments.length ? comments.map(c => `
              <div class="flex gap-2.5" data-comment-id="${c.id}">
                <div class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">${c.createdBy.name[0]}</div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span class="text-xs font-semibold text-gray-800">${c.createdBy.name}</span>
                    <span class="text-xs text-gray-400">${formatDate(c.createdAt)}</span>
                    ${c.createdBy.id === currentUser?.id ? `<button onclick="deleteReqComment('${c.id}','${reqId}','${ticketId}')" class="text-xs text-gray-300 hover:text-red-500 ml-auto">삭제</button>` : ''}
                  </div>
                  <div class="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">${c.content}</div>
                </div>
              </div>`).join('') : '<div class="text-xs text-gray-400">아직 의견이 없습니다.</div>'}
          </div>
          <div class="flex gap-2">
            <textarea id="req-comment-input" rows="2" placeholder="의견을 입력하세요..."
              class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"></textarea>
            <button onclick="submitReqComment('${reqId}','${ticketId}')" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 rounded-lg text-sm self-end py-2 shrink-0 transition">등록</button>
          </div>
        </div>

        <!-- 액션 버튼 -->
        ${canEdit ? `
        <div class="flex gap-2 pt-2 border-t border-gray-100 flex-wrap">
          <button onclick="document.getElementById('req-detail-modal').remove(); openReqModal('${ticketId}', window._reqDetailData)"
            class="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg font-medium">✏️ 수정</button>
          <button onclick="changeReqStatusFromDetail('${req.id}','COMPLETED','${ticketId}')"
            class="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded-lg font-medium">✅ 완료</button>
          <button onclick="changeReqStatusFromDetail('${req.id}','CANCELLED','${ticketId}')"
            class="text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg">🗑 취소</button>
        </div>` : req.status === 'COMPLETED' ? `
        <div class="flex gap-2 pt-2 border-t border-gray-100">
          <button onclick="changeReqStatusFromDetail('${req.id}','ACTIVE','${ticketId}')"
            class="text-xs text-gray-400 hover:text-blue-500 px-3 py-1.5 rounded-lg">↩ 되돌리기</button>
        </div>` : ''}
      </div>`;

    // 상세 팝업 전역 캐시
    window._reqDetailAnnotations = annotations;
    window._reqDetailData = { id: req.id, title: req.title, description: req.description || '' };
  } catch (err) {
    document.getElementById('req-detail-body').innerHTML = `<div class="text-red-500 text-sm p-4">${err.message}</div>`;
  }
}

function viewReqDetailImage(annId, idx) {
  const annotations = window._reqDetailAnnotations || [];
  const ann = annotations[idx];
  if (!ann) return;
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4';
  const total = annotations.length;
  overlay.innerHTML = `
    <div class="relative max-w-4xl w-full flex flex-col items-center gap-3">
      <div class="flex items-center justify-between w-full">
        <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-gray-300 text-2xl leading-none">✕</button>
        <span class="text-white text-sm">${idx + 1} / ${total}</span>
      </div>
      <img src="${ann.imageData}" class="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain" />
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

async function deleteReqAnnotation(annId, reqId, ticketId) {
  if (!confirm('이미지를 삭제하시겠습니까?')) return;
  try {
    await api(`/collab/annotations/${annId}`, { method: 'DELETE' });
    toast('이미지가 삭제되었습니다.');
    document.getElementById('req-detail-modal')?.remove();
    openReqDetailModal(reqId, ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

function addImageToReq(reqId, ticketId) {
  window._qAnnotCallback = async (imageData, shapes) => {
    window._qAnnotCallback = null;
    try {
      await api(`/collab/requirements/${reqId}/annotations`, {
        method: 'POST', body: { imageData, shapes },
      });
      toast('이미지가 추가되었습니다.');
      document.getElementById('req-detail-modal')?.remove();
      openReqDetailModal(reqId, ticketId);
    } catch (err) { toast(err.message, 'error'); }
  };
  openAnnotationModal(null, '요구사항 이미지 추가');
}

async function uploadFilesToReq(reqId, ticketId, input) {
  if (!input.files.length) return;
  try {
    const fd = new FormData();
    Array.from(input.files).forEach(f => fd.append('files', f));
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/collab/requirements/${reqId}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.error || '업로드 실패'); }
    toast('파일이 추가되었습니다.');
    document.getElementById('req-detail-modal')?.remove();
    openReqDetailModal(reqId, ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function changeReqStatusFromDetail(reqId, status, ticketId) {
  const note = status === 'CANCELLED' ? prompt('취소 사유를 입력하세요 (선택):') : null;
  if (status === 'CANCELLED' && note === null) return;
  try {
    await api(`/tickets/requirements/${reqId}/status`, {
      method: 'PATCH', body: { status, changeNote: note },
    });
    toast(`요구사항이 ${reqStatusLabel[status]}로 변경되었습니다.`);
    document.getElementById('req-detail-modal')?.remove();
    openReqDetailModal(reqId, ticketId);
    loadRequirements(ticketId, _isCollaborateActive());
  } catch (err) { toast(err.message, 'error'); }
}

async function submitReqComment(reqId, ticketId) {
  const input = document.getElementById('req-comment-input');
  const content = input?.value.trim();
  if (!content) { toast('내용을 입력해주세요.', 'error'); return; }
  try {
    const comment = await api(`/tickets/requirements/${reqId}/comments`, {
      method: 'POST', body: { content },
    });
    input.value = '';
    const list = document.getElementById('req-comments-list');
    if (!list) return;
    const empty = list.querySelector('.text-gray-400');
    if (empty && empty.textContent.includes('아직')) empty.remove();
    const row = document.createElement('div');
    row.className = 'flex gap-2.5';
    row.dataset.commentId = comment.id;
    row.innerHTML = `
      <div class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">${comment.createdBy.name[0]}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-0.5 flex-wrap">
          <span class="text-xs font-semibold text-gray-800">${comment.createdBy.name}</span>
          <span class="text-xs text-gray-400">${formatDate(comment.createdAt)}</span>
          <button onclick="deleteReqComment('${comment.id}','${reqId}','${ticketId}')" class="text-xs text-gray-300 hover:text-red-500 ml-auto">삭제</button>
        </div>
        <div class="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">${comment.content}</div>
      </div>`;
    list.appendChild(row);
    // update count in header
    const header = list.previousElementSibling;
    if (header) {
      const count = list.querySelectorAll('[data-comment-id]').length;
      header.textContent = `의견 (${count})`;
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteReqComment(commentId, reqId, ticketId) {
  if (!confirm('의견을 삭제하시겠습니까?')) return;
  try {
    await api(`/tickets/requirements/comments/${commentId}`, { method: 'DELETE' });
    toast('의견이 삭제되었습니다.');
    const row = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (row) row.remove();
    const list = document.getElementById('req-comments-list');
    if (list && !list.querySelector('[data-comment-id]')) {
      list.innerHTML = '<div class="text-xs text-gray-400">아직 의견이 없습니다.</div>';
    }
    const header = list?.previousElementSibling;
    if (header) {
      const count = list.querySelectorAll('[data-comment-id]').length;
      header.textContent = `의견 (${count})`;
    }
  } catch (err) { toast(err.message, 'error'); }
}

// ── 요구사항 협의 패널 (COLLABORATE) - 타임라인으로 이동됨 ─────

async function agreeCollabConsensus(ticketId) {
  try {
    const result = await api(`/collab/tickets/${ticketId}/consensus/agree`, { method: 'POST' });
    if (result.advanced) {
      toast('양측 합의 완료! 병합 결재 단계로 진행합니다.');
      navigate('ticket-detail', { id: ticketId });
    } else {
      toast('합의 완료되었습니다.');
      loadWorkflowTimeline(ticketId);
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function resetCollabConsensus(ticketId) {
  try {
    await api(`/collab/tickets/${ticketId}/consensus/reset`, { method: 'POST' });
    toast('합의가 초기화되었습니다.');
    loadWorkflowTimeline(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

// ── 워크플로우 타임라인 ────────────────────────────────────────

async function loadWorkflowTimeline(ticketId) {
  const el = $('#workflow-timeline');
  if (!el) return;
  try {
    const ticket = await api(`/tickets/${ticketId}`);
    const allStages = (ticket.ticketType?.workflowStages || []).filter(s => s.isActive);
    const currentStage = ticket.currentStage;
    const currentStageOrder = currentStage?.stageOrder ?? 0;
    const isCompleted = ticket.status === 'COMPLETED';
    const isRejected = ticket.status === 'REJECTED';

    _currentActionType = currentStage?.actionType || null;

    let extraData = {};
    if (!isCompleted && !isRejected && currentStage) {
      try {
        if (currentStage.actionType === 'COLLABORATE') {
          const [consensus, reqs] = await Promise.all([
            api(`/collab/tickets/${ticketId}/consensus`),
            api(`/tickets/${ticketId}/requirements`),
          ]);
          extraData = { consensus, reqs };
        } else if (currentStage.actionType === 'PARALLEL_APPROVE') {
          extraData.approvals = await api(`/collab/tickets/${ticketId}/parallel-approvals`);
        } else if (currentStage.actionType === 'COMBINED_WORK') {
          extraData.combinedWork = await api(`/collab/tickets/${ticketId}/combined-work`);
        }
      } catch (_) {}
    }

    const isRequester = ticket.requesterId === currentUser.id;
    const isItBa = !isRequester && (ticket.itBa?.id === currentUser.id || ['DEVELOPER', 'MANAGER', 'ADMIN'].includes(currentUser.role));

    const statusBadge = isCompleted
      ? '<span class="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">완료</span>'
      : isRejected
      ? '<span class="text-xs bg-red-100 text-red-600 px-2.5 py-1 rounded-full font-medium">반려(종결)</span>'
      : '<span class="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">진행중</span>';

    // 단계 이력 전역 저장 (클릭 핸들러에서 사용)
    window._wfHistories = {};
    allStages.forEach(stage => {
      window._wfHistories[stage.id] = ticket.stageHistories.filter(h => h.stageId === stage.id);
    });

    // 가로 스텝 렌더링
    const stepsHtml = allStages.map((stage, i) => {
      const status = isCompleted ? 'completed'
        : stage.stageOrder < currentStageOrder ? 'completed'
        : stage.id === currentStage?.id ? 'current'
        : 'pending';
      const histEntries = window._wfHistories[stage.id] || [];
      const lastHist = histEntries[histEntries.length - 1];
      const isLast = i === allStages.length - 1;
      const hasHist = histEntries.length > 0;

      const circleCls = status === 'completed'
        ? `bg-green-500 text-white shadow-sm${hasHist ? ' cursor-pointer hover:bg-green-600 active:scale-95' : ''}`
        : status === 'current'
        ? 'bg-blue-600 text-white ring-4 ring-blue-100'
        : 'bg-gray-100 text-gray-400';
      const nameCls = status === 'completed' ? 'text-gray-600'
        : status === 'current' ? 'text-blue-700 font-semibold'
        : 'text-gray-400';
      const connectorCls = status === 'completed' ? 'bg-green-300' : 'bg-gray-200';

      const metaLine = lastHist
        ? `<div class="text-[10px] text-gray-400 mt-0.5 leading-tight truncate" style="max-width:72px">${lastHist.actor.name}</div>`
        : status === 'current'
        ? '<div class="text-[10px] text-blue-500 mt-0.5 font-medium">진행중</div>'
        : '';

      return `
        <div class="flex items-start flex-shrink-0">
          <div class="flex flex-col items-center text-center" style="width:80px">
            <div class="w-9 h-9 rounded-full ${circleCls} flex items-center justify-center text-sm font-bold flex-shrink-0 transition-all"
              ${hasHist ? `onclick="toggleWfHist('${stage.id}')"` : ''}>
              ${status === 'completed' ? '✓' : stage.stageOrder}
            </div>
            <div class="text-xs ${nameCls} mt-1.5 leading-tight px-0.5" style="word-break:keep-all">${stage.name}</div>
            ${metaLine}
          </div>
          ${!isLast ? `<div class="h-0.5 ${connectorCls} self-start mt-[18px] flex-shrink-0" style="width:clamp(12px,calc(100vw/20),36px)"></div>` : ''}
        </div>`;
    }).join('');

    // 현재 단계 액션 패널
    const currentPanel = (!isCompleted && !isRejected && currentStage)
      ? `<div class="border-t border-gray-100 bg-blue-50/40 px-5 py-4">
           <div class="text-xs font-semibold text-blue-600 mb-3 uppercase tracking-wide">${currentStage.name} 처리</div>
           ${buildCurrentStageContent(ticket, currentStage, extraData, isRequester, isItBa)}
         </div>`
      : '';

    el.innerHTML = `
      <div class="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <span class="font-semibold text-sm text-gray-800">워크플로우 진행현황</span>
        ${statusBadge}
      </div>
      <div class="px-5 py-4 overflow-x-auto">
        <div class="flex items-start">${stepsHtml}</div>
      </div>
      <div id="wf-hist-panel" class="hidden px-5 pb-4"></div>
      ${currentPanel}
    `;
  } catch (err) {
    el.innerHTML = `<div class="p-4 text-red-500 text-sm">${err.message}</div>`;
  }
}

function buildTimelineStage(ticket, stage, status, histEntries, lastHist, extraData, isRequester, isItBa, isLast) {
  const iconHtml = status === 'completed'
    ? `<div class="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-sm">✓</div>`
    : status === 'current'
    ? `<div class="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0 ring-4 ring-blue-100">${stage.stageOrder}</div>`
    : `<div class="w-9 h-9 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-sm font-bold flex-shrink-0">${stage.stageOrder}</div>`;

  const nameCls = status === 'completed' ? 'text-gray-600' : status === 'current' ? 'text-blue-800 font-semibold' : 'text-gray-400';
  const badge = status === 'completed'
    ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">완료</span>'
    : status === 'current'
    ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">진행중</span>'
    : '';

  const metaHtml = status === 'completed' && lastHist
    ? `<div class="text-xs text-gray-400 mt-0.5">${lastHist.actor.name} · ${formatDate(lastHist.createdAt)}${lastHist.comment ? ` — ${lastHist.comment}` : ''}</div>`
    : '';

  const isClickable = status === 'completed' && histEntries.length > 0;
  const historyHtml = isClickable ? `
    <div id="stage-hist-${stage.id}" class="hidden mt-3 pt-3 border-t border-gray-100 space-y-1.5">
      ${histEntries.map(h => `
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <span class="font-medium text-gray-700">${h.actor.name}</span>
          <span class="${h.action === 'APPROVED' || h.action === 'COMPLETED' ? 'text-green-600' : h.action === 'REJECTED' ? 'text-red-500' : 'text-yellow-600'}">
            ${h.action === 'APPROVED' ? '승인' : h.action === 'COMPLETED' ? '완료' : h.action === 'REJECTED' ? '반려(종결)' : h.action === 'RETURNED' ? '반려(반환)' : h.action}
          </span>
          ${h.comment ? `<span class="text-gray-400">— ${h.comment}</span>` : ''}
          ${h.elapsedMinutes != null ? `<span class="ml-auto shrink-0 ${h.slaExceededYn ? 'text-red-500' : 'text-green-600'}">${h.slaExceededYn ? '⚠ SLA초과' : '✓ SLA준수'} ${formatElapsed(h.elapsedMinutes)}</span>` : `<span class="ml-auto text-gray-300 shrink-0">${formatDate(h.createdAt)}</span>`}
        </div>
      `).join('')}
    </div>
  ` : '';

  const currentContent = status === 'current'
    ? `<div class="px-4 pb-5 ml-12">${buildCurrentStageContent(ticket, stage, extraData, isRequester, isItBa)}</div>`
    : '';

  const connectorColor = status === 'completed' ? 'bg-green-300' : 'bg-gray-200';
  const connector = !isLast
    ? `<div class="absolute left-[2.125rem] top-14 bottom-0 w-0.5 ${connectorColor}"></div>`
    : '';

  return `
    <div class="relative ${isLast ? '' : 'border-b border-gray-100'}">
      ${connector}
      <div class="${status === 'current' ? 'bg-blue-50/60' : ''}">
        <div class="flex items-start gap-3 px-4 pt-4 pb-3 ${isClickable ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}"
          ${isClickable ? `onclick="toggleStageHistory('${stage.id}')"` : ''}>
          ${iconHtml}
          <div class="flex-1 min-w-0 pt-0.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm ${nameCls}">${stage.stageOrder}. ${stage.name}</span>
              ${badge}
            </div>
            ${metaHtml}
            ${historyHtml}
          </div>
          ${isClickable ? '<span class="text-gray-300 text-xs mt-1.5 shrink-0 select-none">▾</span>' : ''}
        </div>
        ${currentContent}
      </div>
    </div>
  `;
}

function buildCurrentStageContent(ticket, stage, extraData, isRequester, isItBa) {
  const ticketId = ticket.id;
  const actionType = stage.actionType;

  if (actionType === 'COLLABORATE') {
    const c = extraData.consensus || {};
    const myAgreed = isRequester ? c.requesterAgreed : isItBa ? c.itBaAgreed : false;
    const bothAgreed = c.requesterAgreed && c.itBaAgreed;
    const canAgree = isRequester || isItBa;
    return `
      <div class="space-y-4">
        <p class="text-xs text-blue-600">요청자와 IT BA가 요구사항을 협의합니다. IT BA는 구현 대상 프로그램(영향도 분석)과 테스트케이스를 도출하여 아래 섹션에 등록하고, 양측이 합의하면 결재 단계로 자동 진행됩니다.</p>
        <div class="flex gap-3 flex-wrap">
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${c.requesterAgreed ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}">
            ${c.requesterAgreed ? '✅' : '⬜'}
            <div>
              <div class="text-xs text-gray-500">요청자 (${ticket.requester?.name || '-'})</div>
              <div class="text-xs font-semibold ${c.requesterAgreed ? 'text-green-700' : 'text-gray-400'}">${c.requesterAgreed ? '합의 완료' : '미합의'}</div>
            </div>
          </div>
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${c.itBaAgreed ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'}">
            ${c.itBaAgreed ? '✅' : '⬜'}
            <div>
              <div class="text-xs text-gray-500">IT BA (${ticket.itBa?.name || '-'})</div>
              <div class="text-xs font-semibold ${c.itBaAgreed ? 'text-green-700' : 'text-gray-400'}">${c.itBaAgreed ? '합의 완료' : '미합의'}</div>
            </div>
          </div>
        </div>
        <div class="flex gap-2 flex-wrap items-center">
          ${canAgree && !myAgreed ? `<button onclick="agreeCollabConsensus('${ticketId}')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg font-medium transition">✓ 합의</button>` : ''}
          ${canAgree && myAgreed ? `<span class="text-sm text-green-600 font-medium">✓ 내 합의 완료</span><button onclick="resetCollabConsensus('${ticketId}')" class="text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-lg transition">합의 취소</button>` : ''}
          ${bothAgreed ? `<span class="text-sm text-green-600 font-medium ml-auto">✅ 양측 합의 완료 — 결재 단계로 자동 진행</span>` : ''}
        </div>
      </div>`;
  }

  if (actionType === 'PARALLEL_APPROVE') {
    const approvals = extraData.approvals || [];
    const myApproval = approvals.find(a => a.approverId === currentUser.id);
    const isManagerFirst = stage.name === '책임자 검수';
    const managerApproved = approvals.some(a => a.approver.role === 'MANAGER' && a.action === 'APPROVED');
    const isApprover = ['APPROVER', 'MANAGER', 'ADMIN'].includes(currentUser.role);
    const blockedByManagerGate = isManagerFirst && !['MANAGER', 'ADMIN'].includes(currentUser.role) && !managerApproved;
    const canApprove = isApprover && !myApproval?.action && !blockedByManagerGate;
    const description = isManagerFirst
      ? 'IT 매니저가 먼저 결재하면, IT 결재자와 요청부서장이 동시에 결재합니다. 3명 모두 승인 시 다음 단계로 진행됩니다.'
      : '요청 부서 책임자와 IT 부서 책임자가 동시에 결재합니다. 한 명이라도 반려하면 1단계로 돌아갑니다.';
    return `
      <div class="space-y-3">
        <p class="text-xs text-blue-600">${description}</p>
        ${isManagerFirst ? `
          <div class="flex gap-2 mb-1">
            <span class="text-xs px-2 py-0.5 rounded-full ${managerApproved ? 'bg-green-100 text-green-700' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}">
              ${managerApproved ? '✅ 매니저 결재 완료' : '⏳ 매니저 결재 대기'}
            </span>
          </div>` : ''}
        <div class="space-y-2">
          ${approvals.length === 0 ? '<div class="text-sm text-gray-400 py-2">결재 대기 중...</div>' : ''}
          ${approvals.map(a => `
            <div class="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200">
              <div>
                <div class="text-sm font-medium text-gray-800">${a.approver.name}</div>
                <div class="text-xs text-gray-400">${roleLabel[a.approver.role]}</div>
              </div>
              <span class="text-xs px-2.5 py-1 rounded-full font-medium ${a.action === 'APPROVED' ? 'bg-green-100 text-green-700' : a.action === 'REJECTED' || a.action === 'RETURNED' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}">
                ${a.action === 'APPROVED' ? '✅ 승인' : a.action === 'REJECTED' ? '❌ 반려(종결)' : a.action === 'RETURNED' ? '↩ 반려(반환)' : '⏳ 대기'}
              </span>
            </div>`).join('')}
        </div>
        ${canApprove ? `
          <div class="border-t border-gray-200 pt-3 space-y-2">
            <textarea id="pa-comment" rows="2" placeholder="결재 의견 (선택)" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"></textarea>
            <div class="flex gap-2">
              <button onclick="submitParallelApproval('${ticketId}', 'APPROVED')" class="bg-green-500 hover:bg-green-600 text-white text-sm px-5 py-2 rounded-lg font-medium transition">승인</button>
              <button onclick="submitParallelApproval('${ticketId}', 'RETURNED')" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-4 py-2 rounded-lg transition">반려 (협의 재시작)</button>
              <button onclick="submitParallelApproval('${ticketId}', 'REJECTED')" class="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg transition">반려 (종결)</button>
            </div>
          </div>
        ` : blockedByManagerGate
          ? '<div class="text-sm text-yellow-600">IT 매니저 결재 후 승인 가능합니다.</div>'
          : myApproval?.action
            ? '<div class="text-sm text-green-600">결재를 완료했습니다. 나머지 결재자 대기 중...</div>'
            : '<div class="text-sm text-gray-400">결재 권한이 없습니다.</div>'}
      </div>`;
  }

  if (actionType === 'COMBINED_WORK') {
    const log = extraData.combinedWork;
    const isDev = currentUser.role === 'DEVELOPER' || currentUser.role === 'ADMIN';
    const devDone = !!log?.devCompletedAt;
    const testDone = !!log?.testCompletedAt;
    const devAtts = log?.attachments?.filter(a => a.type === 'DEV') || [];
    const testAtts = log?.attachments?.filter(a => a.type === 'TEST') || [];
    const attHtml = (atts) => atts.map(a => `
      <div class="flex items-center gap-2 p-2 bg-gray-50 rounded mb-1">
        <span class="text-xs flex-1 truncate text-gray-700">${a.originalName}</span>
        <a href="/api/collab/combined-work/attachments/${a.id}/download" class="text-xs text-blue-600 hover:underline shrink-0">다운로드</a>
      </div>`).join('');
    return `
      <div class="space-y-3">
        <p class="text-xs text-blue-600">아래 <b>테스트 케이스</b> 섹션에서 각 케이스별로 개발자·요청자 모두 실행 결과와 증거 파일을 첨부하세요. 개발자가 개발 완료를 제출하고, 요청자가 테스트 완료를 제출하면 다음 단계로 진행됩니다.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="bg-white rounded-xl border ${devDone ? 'border-green-300' : 'border-gray-200'} p-4">
            <div class="flex items-center justify-between mb-3">
              <span class="font-medium text-sm text-gray-800">개발 완료</span>
              <span class="text-xs px-2 py-0.5 rounded-full ${devDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">${devDone ? '✅ 완료' : '⏳ 대기'}</span>
            </div>
            ${isDev && !devDone
              ? `<button onclick="submitCombinedWork('${ticketId}', 'DEV')" class="w-full bg-teal-600 hover:bg-teal-700 text-white text-sm py-2 rounded-lg font-medium transition">개발 완료 제출</button>`
              : isDev && devDone
                ? `<div class="text-xs text-green-600 mb-2">제출 완료.</div>
                   <button onclick="cancelDevComplete('${ticketId}')" class="w-full text-xs border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 py-1.5 rounded-lg transition">↩ 완료 취소</button>`
                : devDone
                  ? `<div class="text-xs text-green-600">제출 완료.</div>`
                  : `<div class="text-xs text-gray-400">담당 개발자가 완료를 제출합니다.</div>`}
          </div>
          <div class="bg-white rounded-xl border ${testDone ? 'border-green-300' : 'border-blue-200'} p-4">
            <div class="flex items-center justify-between mb-3">
              <span class="font-medium text-sm text-gray-800">테스트 완료</span>
              <span class="text-xs px-2 py-0.5 rounded-full ${testDone ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-600'}">${testDone ? '✅ 완료' : '⏳ 대기'}</span>
            </div>
            ${testDone
              ? `<div class="text-xs text-green-700 font-medium">✅ 테스트 완료 제출됨</div>`
              : isRequester
                ? `<button onclick="submitTestCompletion('${ticketId}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg font-medium transition">테스트 완료 제출</button>`
                : `<div class="text-xs text-gray-400">요청자가 테스트 완료를 제출합니다.</div>`
            }
          </div>
        </div>
      </div>`;
  }

  // APPROVE / WORK / CONFIRM / CONSENSUS
  const canProcess = currentUser.role === 'ADMIN'
    || (stage.isRequesterStage && ticket.requesterId === currentUser.id)
    || (!stage.isRequesterStage && stage.requiredRole === currentUser.role);

  if (!canProcess) return `<div class="text-sm text-gray-400">${roleLabel[stage.requiredRole] || stage.requiredRole} 권한이 필요합니다.</div>`;

  let buttons = '';
  if (actionType === 'CONFIRM') {
    buttons = `<button onclick="processTicket('${ticketId}', 'COMPLETED')" class="bg-green-500 hover:bg-green-600 text-white text-sm px-5 py-2 rounded-lg font-medium transition">확인 완료</button>`;
  } else if (actionType === 'APPROVE' || actionType === 'CONSENSUS') {
    buttons = `
      <button onclick="processTicket('${ticketId}', 'APPROVED')" class="bg-green-500 hover:bg-green-600 text-white text-sm px-5 py-2 rounded-lg font-medium transition">승인</button>
      <button onclick="processTicket('${ticketId}', 'RETURNED')" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-4 py-2 rounded-lg transition">반려 (이전단계)</button>
      <button onclick="processTicket('${ticketId}', 'REJECTED')" class="bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg transition">반려 (종결)</button>`;
  } else {
    buttons = `<button onclick="processTicket('${ticketId}', 'COMPLETED')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg font-medium transition">처리 완료</button>`;
  }
  return `
    <div class="space-y-2">
      <textarea id="process-comment" rows="2" placeholder="처리 의견 (선택)" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"></textarea>
      <div class="flex gap-2 flex-wrap">${buttons}</div>
    </div>`;
}

function toggleStageHistory(stageId) {
  const el = $(`#stage-hist-${stageId}`);
  if (el) el.classList.toggle('hidden');
}

function toggleWfHist(stageId) {
  const panel = document.getElementById('wf-hist-panel');
  if (!panel) return;
  const entries = window._wfHistories?.[stageId] || [];
  if (!entries.length) return;

  if (panel.dataset.openId === stageId && !panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    panel.dataset.openId = '';
    return;
  }

  const actionLabel = { APPROVED: '승인', COMPLETED: '완료', REJECTED: '반려(종결)', RETURNED: '반려(반환)' };
  const actionColor = { APPROVED: 'text-green-600', COMPLETED: 'text-green-600', REJECTED: 'text-red-500', RETURNED: 'text-yellow-600' };

  panel.dataset.openId = stageId;
  panel.innerHTML = `
    <div class="border border-gray-100 rounded-xl p-3 bg-gray-50 space-y-1.5">
      ${entries.map(h => `
        <div class="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
          <span class="font-medium text-gray-700">${h.actor.name}</span>
          <span class="${actionColor[h.action] || 'text-gray-500'}">${actionLabel[h.action] || h.action}</span>
          ${h.comment ? `<span class="text-gray-400">— ${h.comment}</span>` : ''}
          ${h.elapsedMinutes != null
            ? `<span class="ml-auto shrink-0 ${h.slaExceededYn ? 'text-red-500' : 'text-green-600'}">${h.slaExceededYn ? '⚠ SLA초과' : '✓ SLA준수'} ${formatElapsed(h.elapsedMinutes)}</span>`
            : `<span class="ml-auto text-gray-300 shrink-0">${formatDate(h.createdAt)}</span>`}
        </div>`).join('')}
    </div>`;
  panel.classList.remove('hidden');
}

async function submitParallelApproval(ticketId, action) {
  const comment = $('#pa-comment')?.value.trim();
  try {
    const result = await api(`/collab/tickets/${ticketId}/parallel-approvals`, {
      method: 'POST', body: { action, comment },
    });
    if (result.redirectedTo === 'stage1') {
      toast('반려되었습니다. 요구사항 협의 단계로 돌아갑니다.', 'error');
    } else if (result.advanced) {
      toast('모든 결재가 완료되었습니다. 개발 단계로 진행합니다.');
    } else {
      toast('결재가 접수되었습니다. 나머지 결재자 대기 중입니다.');
    }
    navigate('ticket-detail', { id: ticketId });
  } catch (err) { toast(err.message, 'error'); }
}

let _devAnnotation = null, _testAnnotation = null, _execAnnotation = null;

function openCombinedAnnotation(type) {
  const existing = type === 'DEV' ? _devAnnotation : _testAnnotation;
  _annotReqId = null;
  _annotShapes = [];
  _pendingAnnotation = existing || null;
  window._qAnnotCallback = (imageData, shapes) => {
    if (type === 'DEV') _devAnnotation = { imageData, shapes };
    else _testAnnotation = { imageData, shapes };
    window._qAnnotCallback = null;
    const preview = $(`#${type.toLowerCase()}-annot-preview`);
    if (preview) preview.classList.remove('hidden');
  };
  openAnnotationModal(null, type === 'DEV' ? '개발 완료 이미지' : '테스트 완료 이미지');
}

function clearCombinedAnnotation(type) {
  if (type === 'DEV') _devAnnotation = null;
  else _testAnnotation = null;
  const preview = $(`#${type.toLowerCase()}-annot-preview`);
  if (preview) preview.classList.add('hidden');
}

function dataURLtoBlob(dataURL) {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], { type: mime });
}

async function submitCombinedWork(ticketId, type) {
  try {
    const ev = await api(`/tests/tickets/${ticketId}/has-evidence`);
    if (!ev.hasEvidence) {
      toast('테스트 케이스에 증빙 파일을 먼저 첨부해주세요. (실행/증빙 버튼 → 파일 첨부)', 'error');
      return;
    }
    const fd = new FormData();
    fd.append('type', type);
    const token = localStorage.getItem('token');
    const res = await fetch('/api/collab/tickets/' + ticketId + '/combined-work', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '제출 실패');
    if (type === 'DEV') _devAnnotation = null;
    else _testAnnotation = null;
    if (data.advanced) {
      toast('개발+테스트가 모두 완료되었습니다. 다음 단계로 진행합니다.');
      navigate('ticket-detail', { id: ticketId });
    } else {
      toast(type === 'DEV' ? '개발 완료가 제출되었습니다.' : '테스트 완료가 제출되었습니다.');
      loadWorkflowTimeline(ticketId);
    }
  } catch (err) { toast(err.message, 'error'); }
}

async function cancelDevComplete(ticketId) {
  if (!confirm('개발 완료 제출을 취소하시겠습니까?')) return;
  try {
    await api(`/collab/tickets/${ticketId}/combined-work/dev`, { method: 'DELETE' });
    toast('개발 완료가 취소되었습니다.');
    loadWorkflowTimeline(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function submitTestCompletion(ticketId) {
  try {
    const ev = await api(`/tests/tickets/${ticketId}/has-evidence`);
    if (!ev.hasEvidence) {
      toast('본인이 실행한 테스트 케이스에 증빙 파일을 먼저 첨부해주세요.', 'error');
      return;
    }
  } catch (err) {
    toast(err.message || '증빙 확인 중 오류가 발생했습니다.', 'error');
    return;
  }
  if (!confirm('테스트 완료를 제출하시겠습니까? 이후 다음 단계로 진행됩니다.')) return;
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/collab/tickets/' + ticketId + '/combined-work/test-complete', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '제출 실패');
    if (data.advanced) {
      toast('개발+테스트가 모두 완료되었습니다. 다음 단계로 진행합니다.');
      navigate('ticket-detail', { id: ticketId });
    } else {
      toast('테스트 완료가 제출되었습니다.');
      loadWorkflowTimeline(ticketId);
    }
  } catch (err) { toast(err.message, 'error'); }
}

// ── 이미지 어노테이션 모달 (Canvas 기반) ─────────────────────

let _annotCanvas, _annotCtx, _annotTool = 'rect', _annotColor = '#ef4444', _annotDrawing = false;
let _annotStartX, _annotStartY, _annotShapes = [], _annotSnapshot, _annotReqId;
let _pendingAnnotation = null; // 요구사항 등록 전 임시 저장

function clearPendingAnnotation() {
  _pendingAnnotation = null;
  const preview = $('#req-pending-preview');
  if (preview) preview.classList.add('hidden');
}

function openAnnotationModal(requirementId, requirementTitle) {
  _annotReqId = requirementId;
  _annotShapes = [];

  const modal = document.createElement('div');
  modal.id = 'annot-modal';
  modal.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h3 class="font-semibold text-gray-800">이미지 모형: ${requirementTitle}</h3>
        <button onclick="closeAnnotationModal()" class="text-gray-400 hover:text-gray-600 text-xl">✕</button>
      </div>

      <!-- 도구 모음 -->
      <div class="flex items-center gap-3 px-6 py-3 bg-gray-50 border-b flex-wrap">
        <span class="text-xs text-gray-500 font-medium">도구:</span>
        <button id="tool-rect" onclick="setAnnotTool('rect')" class="annot-tool-btn active">■ 사각형</button>
        <button id="tool-circle" onclick="setAnnotTool('circle')" class="annot-tool-btn">● 원</button>
        <button id="tool-arrow" onclick="setAnnotTool('arrow')" class="annot-tool-btn">➔ 화살표</button>
        <button id="tool-text" onclick="setAnnotTool('text')" class="annot-tool-btn">T 텍스트</button>
        <span class="text-xs text-gray-400 mx-2">|</span>
        <span class="text-xs text-gray-500 font-medium">색상:</span>
        ${['#ef4444','#f97316','#22c55e','#3b82f6','#8b5cf6'].map(c => `
          <button onclick="setAnnotColor('${c}')" style="background:${c}" class="w-6 h-6 rounded-full border-2 border-white shadow annot-color-btn" data-color="${c}"></button>
        `).join('')}
        <span class="text-xs text-gray-400 mx-2">|</span>
        <button onclick="undoAnnot()" class="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-200">↩ 실행취소</button>
        <button onclick="clearAnnot()" class="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50">✕ 전체삭제</button>
      </div>

      <!-- 캔버스 영역 -->
      <div class="flex-1 overflow-auto p-4 flex flex-col items-center gap-4 min-h-0">
        <div class="text-xs text-gray-400">이미지를 붙여넣으세요 (Ctrl+V / Cmd+V) 또는 파일을 선택하세요.</div>
        <div class="flex gap-2">
          <label class="text-xs text-blue-600 cursor-pointer hover:underline">
            파일 선택
            <input type="file" accept="image/*" class="hidden" onchange="loadAnnotImage(event)"/>
          </label>
        </div>
        <div class="relative border-2 border-dashed border-gray-300 rounded-lg overflow-hidden" id="annot-canvas-container">
          <canvas id="annot-canvas" width="800" height="500" class="block cursor-crosshair"></canvas>
        </div>
      </div>

      <div class="flex justify-end gap-3 px-6 py-4 border-t">
        <button onclick="closeAnnotationModal()" class="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">취소</button>
        <button onclick="saveAnnotation()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-6 py-2 rounded-lg transition font-medium">${requirementId ? '저장' : '✓ 임시 저장'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Add styles
  const style = document.createElement('style');
  style.id = 'annot-styles';
  style.textContent = `.annot-tool-btn{font-size:.75rem;padding:.25rem .6rem;border-radius:.375rem;border:1px solid #d1d5db;background:white;cursor:pointer;color:#374151}.annot-tool-btn.active{background:#4f46e5;color:white;border-color:#4f46e5}.annot-color-btn.active-color{border-color:#111!important;transform:scale(1.2)}`;
  document.head.appendChild(style);

  _annotCanvas = document.getElementById('annot-canvas');
  _annotCtx = _annotCanvas.getContext('2d');
  _annotShapes = [];

  // 기존 어노테이션 또는 임시 저장분 로드
  if (!requirementId && _pendingAnnotation) {
    // pre-save 모드: 임시 저장된 이미지 복원
    const img = new Image();
    img.onload = () => {
      _annotCanvas.width = img.width;
      _annotCanvas.height = img.height;
      _annotCtx.drawImage(img, 0, 0);
      _annotSnapshot = _annotCtx.getImageData(0, 0, _annotCanvas.width, _annotCanvas.height);
      _annotShapes = [...(_pendingAnnotation.shapes || [])];
      redrawAnnot();
    };
    img.src = _pendingAnnotation.imageData;
  } else if (requirementId) {
    loadExistingAnnotation(requirementId);
  }

  // Canvas events
  _annotCanvas.addEventListener('mousedown', annotMouseDown);
  _annotCanvas.addEventListener('mousemove', annotMouseMove);
  _annotCanvas.addEventListener('mouseup', annotMouseUp);

  // Paste listener
  document.addEventListener('paste', annotPaste);

  setAnnotColor('#ef4444');
}

function closeAnnotationModal() {
  document.getElementById('annot-modal')?.remove();
  document.getElementById('annot-styles')?.remove();
  document.removeEventListener('paste', annotPaste);
}

async function loadExistingAnnotation(reqId) {
  try {
    const ann = await api(`/collab/requirements/${reqId}/annotation`);
    if (ann && ann.imageData) {
      const img = new Image();
      img.onload = () => {
        _annotCanvas.width = img.width;
        _annotCanvas.height = img.height;
        _annotCtx.drawImage(img, 0, 0);
        _annotSnapshot = _annotCtx.getImageData(0, 0, _annotCanvas.width, _annotCanvas.height);
        _annotShapes = ann.shapes || [];
        redrawAnnot();
      };
      img.src = ann.imageData;
    }
  } catch (e) {}
}

function annotPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image')) {
      const blob = item.getAsFile();
      const url = URL.createObjectURL(blob);
      loadAnnotImageUrl(url);
      break;
    }
  }
}

function loadAnnotImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  loadAnnotImageUrl(URL.createObjectURL(file));
}

function loadAnnotImageUrl(url) {
  const img = new Image();
  img.onload = () => {
    _annotCanvas.width = Math.min(img.width, 1200);
    _annotCanvas.height = Math.round(img.height * (_annotCanvas.width / img.width));
    _annotCtx.drawImage(img, 0, 0, _annotCanvas.width, _annotCanvas.height);
    _annotSnapshot = _annotCtx.getImageData(0, 0, _annotCanvas.width, _annotCanvas.height);
    _annotShapes = [];
  };
  img.src = url;
}

function setAnnotTool(tool) {
  _annotTool = tool;
  document.querySelectorAll('.annot-tool-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tool-' + tool)?.classList.add('active');
}

function setAnnotColor(color) {
  _annotColor = color;
  document.querySelectorAll('.annot-color-btn').forEach(b => b.classList.remove('active-color'));
  document.querySelector(`.annot-color-btn[data-color="${color}"]`)?.classList.add('active-color');
}

function undoAnnot() {
  _annotShapes.pop();
  redrawAnnot();
}

function clearAnnot() {
  _annotShapes = [];
  if (_annotSnapshot) _annotCtx.putImageData(_annotSnapshot, 0, 0);
  else _annotCtx.clearRect(0, 0, _annotCanvas.width, _annotCanvas.height);
}

function redrawAnnot() {
  if (_annotSnapshot) _annotCtx.putImageData(_annotSnapshot, 0, 0);
  _annotCtx.strokeStyle = _annotColor;
  _annotCtx.lineWidth = 2;
  for (const s of _annotShapes) {
    _annotCtx.strokeStyle = s.color;
    _annotCtx.fillStyle = s.color;
    _annotCtx.lineWidth = 2;
    if (s.type === 'rect') {
      _annotCtx.strokeRect(s.x, s.y, s.w, s.h);
    } else if (s.type === 'circle') {
      _annotCtx.beginPath();
      _annotCtx.ellipse(s.x + s.w/2, s.y + s.h/2, Math.abs(s.w/2), Math.abs(s.h/2), 0, 0, Math.PI*2);
      _annotCtx.stroke();
    } else if (s.type === 'arrow') {
      drawArrow(_annotCtx, s.x, s.y, s.x + s.w, s.y + s.h, s.color);
    } else if (s.type === 'text') {
      _annotCtx.font = 'bold 16px sans-serif';
      _annotCtx.fillText(s.text, s.x, s.y);
    }
  }
}

function drawArrow(ctx, x1, y1, x2, y2, color) {
  const headlen = 12;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI/6), y2 - headlen * Math.sin(angle - Math.PI/6));
  ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI/6), y2 - headlen * Math.sin(angle + Math.PI/6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function getAnnotPos(e) {
  const rect = _annotCanvas.getBoundingClientRect();
  const scaleX = _annotCanvas.width / rect.width;
  const scaleY = _annotCanvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

function annotMouseDown(e) {
  const pos = getAnnotPos(e);
  _annotStartX = pos.x;
  _annotStartY = pos.y;
  _annotDrawing = true;
  _annotSnapshot = _annotCtx.getImageData(0, 0, _annotCanvas.width, _annotCanvas.height);
  if (_annotTool === 'text') {
    const text = prompt('텍스트를 입력하세요:');
    if (text) {
      _annotShapes.push({ type: 'text', x: pos.x, y: pos.y, text, color: _annotColor });
      redrawAnnot();
    }
    _annotDrawing = false;
  }
}

function annotMouseMove(e) {
  if (!_annotDrawing || _annotTool === 'text') return;
  const pos = getAnnotPos(e);
  if (_annotSnapshot) _annotCtx.putImageData(_annotSnapshot, 0, 0);
  redrawAnnot();
  _annotCtx.strokeStyle = _annotColor;
  _annotCtx.lineWidth = 2;
  const w = pos.x - _annotStartX, h = pos.y - _annotStartY;
  if (_annotTool === 'rect') {
    _annotCtx.strokeRect(_annotStartX, _annotStartY, w, h);
  } else if (_annotTool === 'circle') {
    _annotCtx.beginPath();
    _annotCtx.ellipse(_annotStartX + w/2, _annotStartY + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, Math.PI*2);
    _annotCtx.stroke();
  } else if (_annotTool === 'arrow') {
    drawArrow(_annotCtx, _annotStartX, _annotStartY, pos.x, pos.y, _annotColor);
  }
}

function annotMouseUp(e) {
  if (!_annotDrawing || _annotTool === 'text') return;
  const pos = getAnnotPos(e);
  const w = pos.x - _annotStartX, h = pos.y - _annotStartY;
  _annotShapes.push({ type: _annotTool, x: _annotStartX, y: _annotStartY, w, h, color: _annotColor });
  _annotDrawing = false;
  redrawAnnot();
  _annotSnapshot = null;
}

async function viewAnnotationImage(requirementId, title) {
  try {
    const ann = await api(`/collab/requirements/${requirementId}/annotation`);
    if (!ann || !ann.imageData) { toast('저장된 이미지가 없습니다.', 'error'); return; }

    const modal = document.createElement('div');
    modal.id = 'view-annot-modal';
    modal.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between px-6 py-4 border-b">
          <h3 class="font-semibold text-gray-800">이미지 보기: ${title}</h3>
          <div class="flex gap-2">
            <button onclick="openAnnotationModal('${requirementId}', '${title.replace(/'/g, "\\'")}'); document.getElementById('view-annot-modal').remove()"
              class="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded-lg font-medium">✏️ 수정</button>
            <button onclick="document.getElementById('view-annot-modal').remove()" class="text-gray-400 hover:text-gray-600 text-xl ml-2">✕</button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-4 flex items-center justify-center">
          <img src="${ann.imageData}" class="max-w-full max-h-full rounded-lg shadow" />
        </div>
      </div>
    `;
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
  } catch (err) { toast(err.message, 'error'); }
}

async function saveAnnotation() {
  if (!_annotCanvas) return;
  const imageData = _annotCanvas.toDataURL('image/png');

  // Pre-save mode: requirementId가 없으면 임시 저장
  if (!_annotReqId) {
    _pendingAnnotation = { imageData, shapes: [..._annotShapes] };
    // 티켓 등록 폼의 요구사항 이미지 콜백
    if (typeof window._qAnnotCallback === 'function') {
      window._qAnnotCallback(imageData, [..._annotShapes]);
      window._qAnnotCallback = null;
      toast('이미지가 저장되었습니다.');
    } else {
      const preview = $('#req-pending-preview');
      if (preview) preview.classList.remove('hidden');
      toast('이미지가 임시 저장되었습니다. 요구사항 추가 시 함께 저장됩니다.');
    }
    closeAnnotationModal();
    return;
  }

  try {
    await api(`/collab/requirements/${_annotReqId}/annotation`, {
      method: 'POST',
      body: { imageData, shapes: _annotShapes },
    });
    toast('어노테이션이 저장되었습니다.');
    closeAnnotationModal();
  } catch (err) { toast(err.message, 'error'); }
}

// ── 프로그램 영향도분석 ──────────────────────────────────────

const piTypeLabel  = { SCREEN:'화면', INTERFACE:'인터페이스', MODULE:'모듈', QUERY:'쿼리' };
const piTypeColor  = { SCREEN:'bg-blue-100 text-blue-700', INTERFACE:'bg-purple-100 text-purple-700', MODULE:'bg-orange-100 text-orange-700', QUERY:'bg-teal-100 text-teal-700' };
const piLevelLabel = { HIGH:'높음', MEDIUM:'보통', LOW:'낮음' };
const piLevelColor = { HIGH:'bg-red-100 text-red-600', MEDIUM:'bg-yellow-100 text-yellow-700', LOW:'bg-gray-100 text-gray-500' };

function showProgramImpactForm() {
  $('#program-impact-form').classList.toggle('hidden');
  $('#pi-name')?.focus();
}

async function loadProgramImpacts(ticketId) {
  const el = $('#program-impact-list');
  if (!el) return;
  try {
    const items = await api(`/tests/tickets/${ticketId}/program-impacts`);
    if (!items.length) {
      el.innerHTML = '<div class="text-sm text-gray-400">등록된 프로그램이 없습니다.</div>';
      return;
    }
    el.innerHTML = `
      <div class="overflow-x-auto rounded-lg border border-gray-100">
        <table class="w-full text-sm border-collapse">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">유형</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 w-48">프로그램명</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">구분</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">영향도</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap w-28">영향 범위</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap w-44">설명</th>
              <th class="px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">등록자</th>
              <th class="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${items.map(p => `
              <tr id="pi-row-${p.id}" class="hover:bg-gray-50/60 transition-colors">
                <td class="px-3 py-2 whitespace-nowrap">
                  <span class="text-xs px-2 py-0.5 rounded font-medium ${piTypeColor[p.programType]}">${piTypeLabel[p.programType]}</span>
                </td>
                <td class="px-3 py-2 w-48">
                  <div class="font-medium text-gray-800 truncate" title="${p.programName}">${p.programName}</div>
                </td>
                <td class="px-3 py-2 whitespace-nowrap">
                  <span class="text-xs px-2 py-0.5 rounded ${p.isNew ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">${p.isNew ? '신규' : '수정'}</span>
                </td>
                <td class="px-3 py-2 whitespace-nowrap">
                  <span class="text-xs px-2 py-0.5 rounded font-medium ${piLevelColor[p.impactLevel]}">${piLevelLabel[p.impactLevel]}</span>
                </td>
                <td class="px-3 py-2 w-28">
                  <div class="text-xs truncate ${p.impactScope ? 'text-gray-500' : 'text-gray-300'}" title="${p.impactScope || ''}">${p.impactScope || '-'}</div>
                </td>
                <td class="px-3 py-2 w-44 relative group/desc">
                  ${p.description ? `
                  <div class="text-xs text-gray-500 truncate cursor-default">${p.description}</div>
                  <div class="absolute z-50 left-0 top-full mt-1 hidden group-hover/desc:block bg-gray-800 text-white text-xs rounded-lg px-3 py-2 max-w-xs w-max shadow-lg leading-relaxed whitespace-pre-wrap pointer-events-none">${p.description}</div>
                  ` : '<span class="text-xs text-gray-300">-</span>'}
                </td>
                <td class="px-3 py-2 whitespace-nowrap text-xs text-gray-400">${p.createdBy.name}</td>
                <td class="px-3 py-2 whitespace-nowrap text-right">
                  ${currentUser.role !== 'USER' ? `<button onclick="deleteProgramImpact('${p.id}','${ticketId}')" class="text-xs text-red-400 hover:text-red-600 transition-colors">삭제</button>` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) { el.innerHTML = `<div class="text-red-500 text-sm">${err.message}</div>`; }
}

async function submitProgramImpact(ticketId) {
  const programType = $('#pi-type').value;
  const programName = $('#pi-name').value.trim();
  if (!programName) { toast('프로그램명을 입력해주세요.', 'error'); return; }
  try {
    await api(`/tests/tickets/${ticketId}/program-impacts`, {
      method: 'POST',
      body: {
        programType,
        programName,
        isNew: $('#pi-isnew').value === 'true',
        description: $('#pi-desc').value.trim() || null,
        impactLevel: $('#pi-level').value,
        impactScope: $('#pi-scope').value.trim() || null,
      },
    });
    toast('프로그램이 등록되었습니다.');
    $('#program-impact-form').classList.add('hidden');
    ['#pi-name','#pi-desc','#pi-scope'].forEach(s => { if ($(s)) $(s).value = ''; });
    loadProgramImpacts(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteProgramImpact(id, ticketId) {
  if (!confirm('이 프로그램을 삭제하시겠습니까?')) return;
  try {
    await api(`/tests/program-impacts/${id}`, { method: 'DELETE' });
    toast('삭제되었습니다.');
    loadProgramImpacts(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

// ── IT BA 추가 분석 ──────────────────────────────────────────

const itbaState = {};

const ITBA_CHIP_COLORS = { LOW: 'text-green-700', MEDIUM: 'text-amber-700', HIGH: 'text-orange-700', VERY_HIGH: 'text-red-700' };

function selectItbaChip(group, value, el) {
  itbaState[group] = value;
  const container = document.getElementById(
    group === 'ext-iface' ? 'ext-iface-chips' :
    group === 'db-change' ? 'db-change-chips' :
    group === 'customer-facing' ? 'customer-facing-chips' : 'itba-override-chips'
  );
  if (!container) return;
  container.querySelectorAll('.itba-chip').forEach(b => {
    b.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
    const orig = ITBA_CHIP_COLORS[b.dataset.val];
    if (orig) b.classList.add(orig);
  });
  el.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
  if (el.dataset.val) el.classList.remove(ITBA_CHIP_COLORS[el.dataset.val]);
}

function initItbaForm(ticket) {
  itbaState['ext-iface'] = ticket.externalInterfaceCount || null;
  itbaState['db-change'] = ticket.dbChangeRequired == null ? null : (ticket.dbChangeRequired ? '있음' : '없음');
  itbaState['itba-override'] = ticket.itbaDifficultyOverride || null;
  itbaState['customer-facing'] = ticket.isCustomerFacing == null ? null : (ticket.isCustomerFacing ? '예' : '아니오');

  const mark = (containerId, matchText) => {
    const c = document.getElementById(containerId);
    if (!c || !matchText) return;
    c.querySelectorAll('.itba-chip').forEach(b => {
      const isMatch = b.dataset.val ? b.dataset.val === matchText : b.textContent.trim() === matchText;
      if (isMatch) b.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
    });
  };

  mark('ext-iface-chips', ticket.externalInterfaceCount);
  mark('db-change-chips', ticket.dbChangeRequired == null ? null : (ticket.dbChangeRequired ? '있음' : '없음'));
  mark('customer-facing-chips', ticket.isCustomerFacing == null ? null : (ticket.isCustomerFacing ? '예' : '아니오'));
  mark('itba-override-chips', ticket.itbaDifficultyOverride);

  if (!ticket.itbaDifficultyOverride) {
    const none = document.querySelector('#itba-override-chips .itba-chip');
    none?.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
    itbaState['itba-override'] = '';
  }
}

async function saveItbaAnalysis(ticketId) {
  const btn = document.getElementById('itba-save-btn');
  const resultBox = document.getElementById('itba-result');
  const spinnerHTML = `<svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 재산정 중...`;

  if (btn) { btn.disabled = true; btn.innerHTML = spinnerHTML; }
  if (resultBox) resultBox.className = 'hidden mt-3';

  const extIface = itbaState['ext-iface'] || null;
  const dbChangeRaw = itbaState['db-change'];
  const dbChange = dbChangeRaw === '있음' ? true : dbChangeRaw === '없음' ? false : null;
  const override = itbaState['itba-override'] || null;
  const customerFacingRaw = itbaState['customer-facing'];
  const isCustomerFacing = customerFacingRaw === '예' ? true : customerFacingRaw === '아니오' ? false : null;

  try {
    const result = await api(`/tests/tickets/${ticketId}/itba-analysis`, {
      method: 'PATCH',
      body: { externalInterfaceCount: extIface, dbChangeRequired: dbChange, itbaDifficultyOverride: override, isCustomerFacing },
    });

    const diff = result.finalDifficulty || result.aiEstimatedDifficulty;
    if (diff) {
      const isFinal = !!result.finalDifficulty;
      const colorClass = DIFFICULTY_COLOR[diff] || 'text-gray-600 bg-gray-50';
      const borderClass = diff === 'VERY_HIGH' ? 'border-red-200 bg-red-50'
        : diff === 'HIGH' ? 'border-orange-200 bg-orange-50'
        : diff === 'MEDIUM' ? 'border-amber-200 bg-amber-50'
        : 'border-green-200 bg-green-50';
      const innerHTML = `
        <div class="flex items-center gap-3 mb-1">
          <span class="text-xs text-gray-500">${isFinal ? '확정 난이도' : 'AI 예측 난이도'}</span>
          <span class="px-2.5 py-0.5 rounded-lg text-sm font-bold ${colorClass}">${DIFFICULTY_LABEL[diff] || diff}</span>
          ${result.aiEstimatedDays ? `<span class="text-sm text-gray-500">예상 ${result.aiEstimatedDays}</span>` : ''}
        </div>
        ${result.aiDifficultyReason ? `<div class="text-xs text-gray-500 leading-relaxed">${result.aiDifficultyReason}</div>` : ''}
      `;

      const card = document.getElementById('difficulty-card');
      if (card) {
        card.className = `mb-4 p-4 rounded-xl border ${borderClass}`;
        card.innerHTML = innerHTML;
      }

      if (resultBox) {
        resultBox.className = `mt-3 p-4 rounded-xl border ${borderClass}`;
        resultBox.innerHTML = `<div class="text-xs font-semibold text-gray-600 mb-2">재산정 결과</div>${innerHTML}`;
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      toast('난이도가 재산정되었습니다.');
    }
  } catch (err) { toast(err.message, 'error'); }
  finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '난이도 재산정'; }
  }
}

// ── 테스트 관리 ───────────────────────────────────────────

const tcStatusLabel  = { DRAFT:'초안', READY:'대기', PASS:'통과', FAIL:'실패', BLOCKED:'차단' };
const tcStatusColor  = { DRAFT:'bg-gray-100 text-gray-500', READY:'bg-blue-100 text-blue-600', PASS:'bg-green-100 text-green-700', FAIL:'bg-red-100 text-red-600', BLOCKED:'bg-yellow-100 text-yellow-700' };
const dfSeverityLabel = { CRITICAL:'긴급', HIGH:'높음', MEDIUM:'보통', LOW:'낮음' };
const dfSeverityColor = { CRITICAL:'bg-red-600 text-white', HIGH:'bg-orange-500 text-white', MEDIUM:'bg-yellow-400 text-gray-800', LOW:'bg-gray-200 text-gray-600' };
const dfStatusLabel  = { OPEN:'신규', IN_PROGRESS:'처리중', RESOLVED:'해결', CLOSED:'종료', REJECTED:'반려' };

async function loadTestCases(ticketId) {
  const el = $('#test-case-list');
  if (!el) return;
  try {
    const cases = await api(`/tests/tickets/${ticketId}/test-cases`);
    if (!cases.length) { el.innerHTML = '<div class="text-sm text-gray-400">등록된 테스트 케이스가 없습니다.</div>'; return; }
    el.innerHTML = cases.map(tc => `
      <div class="border border-gray-200 rounded-xl overflow-hidden mb-2">
        <div class="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100" onclick="toggleTcDetail('${tc.id}')">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xs px-2 py-0.5 rounded font-medium ${tcStatusColor[tc.status]} shrink-0">${tcStatusLabel[tc.status]}</span>
            <span class="font-medium text-sm text-gray-800 truncate">${tc.title}</span>
            <span class="text-xs px-1.5 py-0.5 rounded ${priorityColor[tc.priority] || 'bg-gray-100 text-gray-500'} shrink-0">${priorityLabel[tc.priority] || tc.priority}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0 ml-2">
            <span class="text-xs text-gray-400">${tc._count.testResults}회 실행</span>
            <div class="flex gap-1">
              <button onclick="event.stopPropagation();showExecModal('${tc.id}','${ticketId}')" class="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-0.5 rounded font-medium">실행/증빙</button>
              ${currentUser.role !== 'USER' ? `<button onclick="event.stopPropagation();deleteTestCase('${tc.id}','${ticketId}')" class="text-xs text-gray-300 hover:text-red-500">✕</button>` : ''}
            </div>
            <span class="text-gray-400 text-xs" id="tc-arrow-${tc.id}">▼</span>
          </div>
        </div>
        <div id="tc-detail-${tc.id}" class="hidden">
          <div class="px-4 py-3 border-t border-gray-100 grid grid-cols-1 gap-3 bg-white text-sm">
            ${tc.preconditions ? `<div><div class="text-xs text-gray-400 mb-1 font-medium">사전 조건</div><div class="text-gray-700 whitespace-pre-line">${tc.preconditions}</div></div>` : ''}
            <div><div class="text-xs text-gray-400 mb-1 font-medium">테스트 단계</div><div class="text-gray-700 whitespace-pre-line">${tc.testSteps}</div></div>
            <div><div class="text-xs text-gray-400 mb-1 font-medium">기대 결과</div><div class="text-gray-700 whitespace-pre-line">${tc.expectedResult}</div></div>
          </div>
          <!-- 테스트 실행 버튼 (상세 내부) -->
          <div class="px-4 py-3 border-t border-gray-100 bg-blue-50">
            <button onclick="showExecModal('${tc.id}','${ticketId}')"
              class="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              <span>📋</span> 실행 기록 및 증빙 파일 첨부
            </button>
          </div>
          <div id="tc-results-${tc.id}" class="px-4 pb-4 bg-white">
            <div class="text-xs text-gray-400 font-medium mb-2 mt-1">실행 이력</div>
            <div class="text-xs text-gray-400">불러오는 중...</div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) { el.innerHTML = `<div class="text-red-500 text-sm">${err.message}</div>`; }
}

async function toggleTcDetail(tcId) {
  const detail = $(`#tc-detail-${tcId}`);
  const arrow = $(`#tc-arrow-${tcId}`);
  if (!detail) return;
  const isHidden = detail.classList.contains('hidden');
  detail.classList.toggle('hidden');
  if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
  if (isHidden) await loadTcResults(tcId);
}

async function loadTcResults(tcId) {
  const el = $(`#tc-results-${tcId}`);
  if (!el) return;
  try {
    const results = await api(`/tests/test-cases/${tcId}/results`);
    if (!results.length) { el.innerHTML = '<div class="text-xs text-gray-400 mt-1">실행 이력이 없습니다.</div>'; return; }
    const resultColor = { PASS: 'bg-green-100 text-green-700', FAIL: 'bg-red-100 text-red-600', BLOCKED: 'bg-yellow-100 text-yellow-700', SKIPPED: 'bg-gray-100 text-gray-500' };
    el.innerHTML = `
      <div class="text-xs text-gray-400 font-medium mb-2 mt-1">실행 이력 (${results.length}건)</div>
      <div class="space-y-2">
        ${results.map(r => `
          <div class="border border-gray-100 rounded-lg p-3 bg-gray-50">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold px-2 py-0.5 rounded ${resultColor[r.status] || 'bg-gray-100 text-gray-600'}">${tcStatusLabel[r.status] || r.status}</span>
              <span class="text-xs text-gray-400">${r.tester.name} · ${formatDate(r.executedAt)}</span>
            </div>
            ${r.actualResult ? `<div class="text-xs text-gray-600 mt-1"><span class="font-medium">실제 결과:</span> ${r.actualResult}</div>` : ''}
            ${r.comment ? `<div class="text-xs text-gray-600 mt-0.5"><span class="font-medium">의견:</span> ${r.comment}</div>` : ''}
            ${r.attachments?.length ? `
              <div class="mt-2 flex flex-wrap gap-1">
                ${r.attachments.map(a => `
                  <a href="/api/tests/attachments/${a.id}/download" target="_blank"
                    class="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg">
                    📎 ${a.originalName} <span class="text-gray-400">(${formatFileSize(a.size)})</span>
                  </a>
                `).join('')}
              </div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) { el.innerHTML = `<div class="text-red-500 text-xs">${err.message}</div>`; }
}

async function loadDefects(ticketId) {
  const el = $('#defect-list');
  if (!el) return;
  try {
    const defects = await api(`/tests/tickets/${ticketId}/defects`);
    if (!defects.length) { el.innerHTML = '<div class="text-sm text-gray-400">등록된 결함이 없습니다.</div>'; return; }
    el.innerHTML = `<div class="overflow-x-auto"><table class="w-full text-sm">
      <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
        <tr>
          <th class="px-3 py-2 text-left">결함 제목</th>
          <th class="px-3 py-2 text-left">심각도</th>
          <th class="px-3 py-2 text-left">상태</th>
          <th class="px-3 py-2 text-left">보고자</th>
          <th class="px-3 py-2 text-left">담당자</th>
          <th class="px-3 py-2 text-left">처리</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        ${defects.map(d => `
          <tr>
            <td class="px-3 py-2 font-medium">${d.title}</td>
            <td class="px-3 py-2"><span class="text-xs px-2 py-0.5 rounded font-medium ${dfSeverityColor[d.severity]}">${dfSeverityLabel[d.severity]}</span></td>
            <td class="px-3 py-2"><span class="text-xs px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-600">${dfStatusLabel[d.status]}</span></td>
            <td class="px-3 py-2 text-xs text-gray-500">${d.reporter.name}</td>
            <td class="px-3 py-2 text-xs text-gray-500">${d.assignee?.name || '-'}</td>
            <td class="px-3 py-2">
              <select onchange="updateDefectStatus('${d.id}',this.value,'${ticketId}')" class="text-xs border border-gray-200 rounded px-1 py-0.5">
                ${['OPEN','IN_PROGRESS','RESOLVED','CLOSED','REJECTED'].map(s =>
                  `<option value="${s}" ${d.status===s?'selected':''}>${dfStatusLabel[s]}</option>`).join('')}
              </select>
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;
  } catch (err) { el.innerHTML = `<div class="text-red-500 text-sm">${err.message}</div>`; }
}

function showTestCaseForm() {
  $('#test-case-form').classList.toggle('hidden');
  $('#tc-title')?.focus();
}

async function submitTestCase(ticketId) {
  const title = $('#tc-title').value.trim();
  const testSteps = $('#tc-steps').value.trim();
  const expectedResult = $('#tc-expected').value.trim();
  if (!title || !testSteps || !expectedResult) { toast('제목, 테스트 단계, 기대 결과를 입력해주세요.', 'error'); return; }
  try {
    await api(`/tests/tickets/${ticketId}/test-cases`, {
      method: 'POST',
      body: {
        title, testSteps, expectedResult,
        preconditions: $('#tc-preconditions').value.trim(),
        priority: $('#tc-priority').value,
      },
    });
    toast('테스트 케이스가 추가되었습니다.');
    $('#test-case-form').classList.add('hidden');
    ['#tc-title','#tc-preconditions','#tc-steps','#tc-expected'].forEach(s => { if($(s)) $(s).value=''; });
    loadTestCases(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

function showExecModal(tcId, ticketId) {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  if (!overlay || !content) return;

  _execAnnotation = null;

  content.innerHTML = `
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-bold text-gray-800">테스트 실행 기록</h3>
        <button onclick="closeExecModal()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
      </div>

      <div class="mb-5">
        <div class="text-sm font-medium text-gray-700 mb-2">실행 결과 <span class="text-red-500">*</span></div>
        <div class="grid grid-cols-4 gap-2">
          ${[['PASS','통과','bg-green-500'],['FAIL','실패','bg-red-500'],['BLOCKED','차단','bg-yellow-500'],['SKIPPED','건너뜀','bg-gray-400']].map(([val, label, color]) => `
            <button type="button" onclick="selectExecStatus('${val}')"
              id="exec-btn-${val}"
              class="exec-status-btn py-2 rounded-lg text-sm font-semibold text-white ${color} opacity-40 hover:opacity-80 transition-opacity">
              ${label}
            </button>
          `).join('')}
        </div>
        <input type="hidden" id="exec-status" value="">
      </div>

      <div class="mb-4">
        <label class="text-sm font-medium text-gray-700 mb-1 block">실제 결과</label>
        <textarea id="exec-actual" rows="3" placeholder="테스트 수행 결과를 입력하세요"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"></textarea>
      </div>

      <div class="mb-4">
        <label class="text-sm font-medium text-gray-700 mb-1 block">의견 / 메모</label>
        <textarea id="exec-comment" rows="2" placeholder="추가 의견 (선택)"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"></textarea>
      </div>

      <div class="mb-4">
        <label class="text-sm font-medium text-gray-700 mb-1 block">증거 파일 첨부 <span class="text-xs text-gray-400">(선택, 최대 10개)</span></label>
        <input type="file" id="exec-files" multiple onchange="updateExecFileList()"
          class="block w-full text-sm text-gray-500
            file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
            file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100 cursor-pointer border border-gray-200 rounded-lg p-1">
        <div id="exec-file-names" class="mt-2 text-xs text-blue-600 space-y-0.5"></div>
      </div>

      <div class="mb-6">
        <label class="text-sm font-medium text-gray-700 mb-1 block">이미지 도구로 증거 첨부</label>
        <div class="flex items-center gap-2">
          <button type="button" onclick="openExecAnnotation()" class="flex items-center gap-1 text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg font-medium transition">🖼️ 이미지 도구</button>
          <div id="exec-annot-preview" class="hidden items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded">
            ✓ 이미지 첨부됨
            <button type="button" onclick="clearExecAnnotation()" class="text-red-400 hover:text-red-600 font-bold ml-1">✕</button>
          </div>
        </div>
      </div>

      <div class="flex gap-3 justify-end">
        <button onclick="closeExecModal()" class="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">취소</button>
        <button onclick="submitExecModal('${tcId}','${ticketId}')" class="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">저장</button>
      </div>
    </div>
  `;

  overlay.classList.remove('hidden');
}

function openExecAnnotation() {
  _execAnnotation = null;
  _pendingAnnotation = null;
  window._qAnnotCallback = (imageData, shapes) => {
    _execAnnotation = { imageData, shapes };
    window._qAnnotCallback = null;
    const preview = $('#exec-annot-preview');
    if (preview) { preview.classList.remove('hidden'); preview.style.display = 'flex'; }
  };
  openAnnotationModal(null, '테스트 증거 이미지');
}

function clearExecAnnotation() {
  _execAnnotation = null;
  const preview = $('#exec-annot-preview');
  if (preview) preview.classList.add('hidden');
}

function selectExecStatus(val) {
  $('#exec-status').value = val;
  document.querySelectorAll('.exec-status-btn').forEach(btn => btn.classList.add('opacity-40'));
  $(`#exec-btn-${val}`)?.classList.remove('opacity-40');
  $(`#exec-btn-${val}`)?.classList.add('opacity-100');
}

function updateExecFileList() {
  const files = $('#exec-files').files;
  const names = $('#exec-file-names');
  if (!names) return;
  names.innerHTML = Array.from(files).map(f =>
    `<div>✓ ${f.name} <span class="text-gray-400">(${formatFileSize(f.size)})</span></div>`
  ).join('');
}

function closeExecModal() {
  $('#modal-overlay')?.classList.add('hidden');
}

async function submitExecModal(tcId, ticketId) {
  const status = $('#exec-status').value;
  if (!status) { toast('실행 결과를 선택해주세요.', 'error'); return; }

  const fd = new FormData();
  fd.append('status', status);
  const actual = $('#exec-actual').value.trim();
  const comment = $('#exec-comment').value.trim();
  if (actual) fd.append('actualResult', actual);
  if (comment) fd.append('comment', comment);

  const files = $('#exec-files')?.files;
  if (files) Array.from(files).forEach(f => fd.append('files', f));

  if (_execAnnotation?.imageData) {
    const blob = dataURLtoBlob(_execAnnotation.imageData);
    fd.append('files', blob, `test-evidence-${Date.now()}.png`);
  }
  _execAnnotation = null;

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/tests/test-cases/${tcId}/execute`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '오류가 발생했습니다.' }));
      throw new Error(err.error || '오류가 발생했습니다.');
    }
    closeExecModal();
    toast('테스트 실행이 기록되었습니다.');
    loadTestCases(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function execTest(testCaseId, status, ticketId) {
  const comment = status === 'FAIL' ? prompt('실패 내용을 입력하세요 (선택):') : null;
  if (status === 'FAIL' && comment === null) return;
  try {
    await api(`/tests/test-cases/${testCaseId}/execute`, {
      method: 'POST',
      body: { status, comment },
    });
    toast(`테스트 ${tcStatusLabel[status]}로 기록되었습니다.`);
    loadTestCases(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function deleteTestCase(testCaseId, ticketId) {
  if (!confirm('테스트 케이스를 삭제하시겠습니까?')) return;
  try {
    await api(`/tests/test-cases/${testCaseId}`, { method: 'DELETE' });
    toast('삭제되었습니다.');
    loadTestCases(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

function showDefectForm() {
  $('#defect-form').classList.toggle('hidden');
  $('#df-title')?.focus();
}

async function submitDefect(ticketId) {
  const title = $('#df-title').value.trim();
  const description = $('#df-desc').value.trim();
  if (!title || !description) { toast('제목과 설명을 입력해주세요.', 'error'); return; }
  try {
    await api(`/tests/tickets/${ticketId}/defects`, {
      method: 'POST',
      body: { title, description, severity: $('#df-severity').value },
    });
    toast('결함이 등록되었습니다.');
    $('#defect-form').classList.add('hidden');
    ['#df-title','#df-desc'].forEach(s => { if($(s)) $(s).value=''; });
    loadDefects(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function updateDefectStatus(defectId, status, ticketId) {
  try {
    await api(`/tests/defects/${defectId}`, { method: 'PUT', body: { status } });
    toast('결함 상태가 변경되었습니다.');
    loadDefects(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

function renderProcessPanel(ticket, stages, currentIdx) {
  if (ticket.status !== 'IN_PROGRESS') return '';
  const stage = stages[currentIdx];
  if (!stage) return '';

  const actionType = stage.actionType;

  // COLLABORATE / PARALLEL_APPROVE / COMBINED_WORK: rendered by dedicated sections below
  if (['COLLABORATE', 'PARALLEL_APPROVE', 'COMBINED_WORK'].includes(actionType)) return '';

  const canProcess = (
    currentUser.role === 'ADMIN' ||
    (stage.isRequesterStage && ticket.requesterId === currentUser.id) ||
    (!stage.isRequesterStage && stage.requiredRole === currentUser.role)
  );
  if (!canProcess) return '';

  // 단계 유형별 버튼 구성
  let buttons = '';
  const prevStage = stages[currentIdx - 1];
  const prevIsRequesterStage = prevStage?.isRequesterStage;

  if (actionType === 'CONFIRM') {
    buttons = `<button onclick="processTicket('${ticket.id}', 'COMPLETED')" class="bg-green-500 hover:bg-green-600 text-white text-sm px-5 py-2 rounded-lg transition font-medium">확인완료</button>`;
  } else if (actionType === 'APPROVE' || actionType === 'CONSENSUS') {
    const isReqReview = stage.name === '요구사항 검토';
    buttons = `
      <button onclick="processTicket('${ticket.id}', 'APPROVED')" class="bg-green-500 hover:bg-green-600 text-white text-sm px-5 py-2 rounded-lg transition font-medium">${isReqReview ? '요구사항 승인' : '승인'}</button>
      ${currentIdx > 0 ? `<button onclick="processTicket('${ticket.id}', 'RETURNED')" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-5 py-2 rounded-lg transition font-medium">${isReqReview ? '보완 요청' : '반려(이전단계)'}</button>` : ''}
      <button onclick="processTicket('${ticket.id}', 'REJECTED')" class="bg-red-500 hover:bg-red-600 text-white text-sm px-5 py-2 rounded-lg transition font-medium">반려(종결)</button>
    `;
  } else if (stage.name === '요구사항 등록') {
    // 요구사항 등록 단계: 요구사항 존재 여부 검증 후 제출
    buttons = `<button onclick="submitRequirementsStage('${ticket.id}')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg transition font-medium">요구사항 제출</button>`;
  } else {
    buttons = `
      <button onclick="processTicket('${ticket.id}', 'COMPLETED')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded-lg transition font-medium">처리완료</button>
      ${prevIsRequesterStage ? `<button onclick="processTicket('${ticket.id}', 'RETURNED')" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-5 py-2 rounded-lg transition font-medium">요구사항 재작성 요청</button>` : currentIdx > 0 ? `<button onclick="processTicket('${ticket.id}', 'RETURNED')" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-5 py-2 rounded-lg transition font-medium">반려(이전단계)</button>` : ''}
    `;
  }

  return `
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-6" data-stage-name="${stage.name}">
      <h3 class="font-semibold text-blue-800 mb-1">현재 단계: ${stage.name}</h3>
      <p class="text-sm text-blue-600 mb-3">담당 역할: ${roleLabel[stage.requiredRole]}</p>
      ${stage.name === '요구사항 검토' ? `<p class="text-xs text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2 mb-3">요구사항별로 검토 상태를 설정하세요. 개발 착수 준비가 되면 <b>요구사항 승인</b>을 눌러 다음 단계로 진행합니다.</p>` : ''}
      <textarea id="process-comment" rows="3" placeholder="처리 의견 (선택)" class="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none mb-3"></textarea>
      <div class="flex gap-2 flex-wrap">${buttons}</div>
    </div>
  `;
}

let _selectedDevelopers = []; // { id, name, role }

function setupManagerSearch() {
  const input = $('#manager-search');
  const dropdown = $('#manager-dropdown');
  if (!input) return;

  const load = (q) => userDDLoad('/common/users/it-managers', q, dropdown, (u) => {
    $('#manager-id').value = u.id;
    $('#manager-name').textContent = `${u.name} (${roleLabel[u.role]})`;
    $('#manager-selected').classList.remove('hidden');
    input.value = '';
    dropdown.classList.add('hidden');
  });

  input.addEventListener('focus', () => load(''));
  input.addEventListener('input', () => load(input.value.trim()));
  document.addEventListener('click', (e) => {
    if (!input.closest('.relative')?.contains(e.target) && !dropdown.contains(e.target))
      dropdown.classList.add('hidden');
  });
}

function clearManager() {
  $('#manager-id').value = '';
  $('#manager-selected').classList.add('hidden');
}

function setupAssigneeSearch() {
  _selectedDevelopers = [];
  const input = $('#assignee-search');
  const dropdown = $('#assignee-dropdown');
  if (!input) return;

  const load = (q) => userDDLoad('/common/users/it-team', q, dropdown, (u) => {
    selectAssignee(u.id, u.name, u.role);
  });

  input.addEventListener('focus', () => load(''));
  input.addEventListener('input', () => load(input.value.trim()));

  document.addEventListener('click', (e) => {
    if (!input.closest('.relative')?.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function selectAssignee(id, name, role) {
  if (_selectedDevelopers.find(d => d.id === id)) return; // 중복 방지
  _selectedDevelopers.push({ id, name, role });
  renderAssigneeTags();
  $('#assignee-search').value = '';
  $('#assignee-dropdown').classList.add('hidden');
}

function removeAssignee(id) {
  _selectedDevelopers = _selectedDevelopers.filter(d => d.id !== id);
  renderAssigneeTags();
}

function renderAssigneeTags() {
  const el = $('#assignee-tags');
  if (!el) return;
  el.innerHTML = _selectedDevelopers.map(d => `
    <span class="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap">
      ${d.name} <span class="text-blue-500">(${roleLabel[d.role]})</span>
      <button type="button" onclick="removeAssignee('${d.id}')" class="hover:text-red-600 font-bold ml-0.5">✕</button>
    </span>
  `).join('');
}

async function submitRequirementsStage(ticketId) {
  try {
    const reqs = await api(`/tickets/${ticketId}/requirements`);
    const active = reqs.filter(r => r.status !== 'CANCELLED');
    if (active.length === 0) {
      return toast('요구사항을 1개 이상 등록해야 제출할 수 있습니다.', 'error');
    }
    const comment = $('#process-comment')?.value;
    const res = await api(`/tickets/${ticketId}/process`, { method: 'POST', body: { action: 'COMPLETED', comment } });
    toast(res.message || '요구사항이 제출되었습니다. IT BA 영향도분석 단계로 이동합니다.');
    renderTicketDetail({ id: ticketId });
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function processTicket(ticketId, action) {
  const comment = $('#process-comment')?.value;

  // 개발자 지정 필수 단계: REJECTED/RETURNED 이외 액션에서는 반드시 지정
  if ($('#assignee-search') !== null && _selectedDevelopers.length === 0 && action !== 'REJECTED' && action !== 'RETURNED') {
    return toast('개발자를 1명 이상 지정해야 합니다.', 'error');
  }

  const developerIds = _selectedDevelopers.length > 0 ? _selectedDevelopers.map(d => d.id) : undefined;
  const assigneeId = developerIds?.[0] || undefined;
  const managerId = $('#manager-id')?.value || undefined;

  if ($('#manager-id') !== null && !managerId && action !== 'REJECTED' && action !== 'RETURNED') {
    return toast('IT 책임자를 지정해야 합니다.', 'error');
  }

  try {
    const res = await api(`/tickets/${ticketId}/process`, { method: 'POST', body: { action, comment, assigneeId, developerIds, managerId } });
    toast(res.message || '처리되었습니다.');
    renderTicketDetail({ id: ticketId });
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function processConsensus(consensusId, action) {
  const comment = prompt(action === 'REJECTED' ? '반려 사유를 입력하세요:' : '');
  try {
    await api(`/tickets/consensus/${consensusId}`, { method: 'PATCH', body: { action, comment } });
    toast(action === 'APPROVED' ? '승인되었습니다.' : '반려되었습니다.');
    location.reload();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function uploadAttachments(event, ticketId) {
  const files = [...event.target.files];
  if (!files.length) return;
  try {
    const results = await Promise.allSettled(files.map(f => uploadFile(ticketId, f)));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) toast(`${files.length - failed}개 업로드 완료, ${failed}개 실패`, 'warn');
    else toast(`${files.length}개 파일이 업로드되었습니다.`);
    renderTicketDetail({ id: ticketId });
  } catch (err) { toast(err.message, 'error'); }
}

async function submitComment(ticketId) {
  const content = $('#comment-input').value.trim();
  if (!content) return;
  try {
    await api(`/tickets/${ticketId}/comments`, { method: 'POST', body: { content } });
    toast('댓글이 등록되었습니다.');
    renderTicketDetail({ id: ticketId });
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── 관리자 대시보드 ───────────────────────────────────────
async function renderAdminDashboard() {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm">불러오는 중...</div>';
  try {
    const data = await api('/admin/dashboard');
    const { summary, slaRate, slaExceededCount, slaTotalCount, slaStatus, ticketsByType } = data;

    const slaStatusRows = (slaStatus || []).map(t => {
      const pct = t.slaPercent;
      const barColor = t.slaExceeded ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-green-500';
      const barPct = Math.min(pct ?? 0, 100);
      return `
        <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('ticket-detail','${t.id}')">
          <td class="px-4 py-2 font-mono text-xs text-blue-600">${t.ticketNumber}</td>
          <td class="px-4 py-2 text-sm max-w-xs truncate">${t.title}</td>
          <td class="px-4 py-2 text-xs text-gray-500">${t.typeName}</td>
          <td class="px-4 py-2 text-xs text-gray-500">${t.stageName || '-'}</td>
          <td class="px-4 py-2 text-xs">${t.requesterName}</td>
          <td class="px-4 py-2">
            <div class="flex items-center gap-2">
              <div class="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full ${barColor}" style="width:${barPct}%"></div>
              </div>
              <span class="text-xs font-medium ${t.slaExceeded ? 'text-red-600' : 'text-gray-600'}">
                ${formatElapsed(t.elapsedHours * 60)}${t.slaTargetHours ? ' / ' + t.slaTargetHours + 'h' : ''}
              </span>
              ${t.slaExceeded ? '<span class="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">SLA초과</span>' :
                pct >= 80 ? '<span class="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">위험</span>' : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${summaryCard('전체 티켓', summary.totalTickets, 'blue')}
        ${summaryCard('진행중', summary.inProgressTickets, 'yellow')}
        ${summaryCard('완료', summary.completedTickets, 'green')}
        ${summaryCard('반려', summary.rejectedTickets, 'blue')}
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h3 class="font-semibold text-gray-800 mb-3">SLA 준수율 (누적)</h3>
        ${slaRate !== null ? `
          <div class="flex items-center gap-6 mb-3">
            <div class="text-4xl font-bold ${slaRate >= 90 ? 'text-green-600' : slaRate >= 70 ? 'text-yellow-500' : 'text-red-500'}">${slaRate}%</div>
            <div class="flex-1">
              <div class="h-4 bg-gray-100 rounded-full overflow-hidden mb-1">
                <div class="h-full rounded-full ${slaRate >= 90 ? 'bg-green-500' : slaRate >= 70 ? 'bg-yellow-400' : 'bg-red-500'}" style="width:${slaRate}%"></div>
              </div>
              <div class="text-xs text-gray-400">총 ${slaTotalCount}건 처리 중 SLA 초과 ${slaExceededCount}건</div>
            </div>
          </div>
        ` : '<div class="text-gray-400 text-sm">완료된 단계 이력이 없습니다.</div>'}
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h3 class="font-semibold text-gray-800 mb-3">진행중 티켓 SLA 현황</h3>
        ${slaStatusRows ? `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th class="px-4 py-2 text-left">티켓번호</th>
                  <th class="px-4 py-2 text-left">제목</th>
                  <th class="px-4 py-2 text-left">유형</th>
                  <th class="px-4 py-2 text-left">현재 단계</th>
                  <th class="px-4 py-2 text-left">요청자</th>
                  <th class="px-4 py-2 text-left">단계 체류 시간</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">${slaStatusRows}</tbody>
            </table>
          </div>
        ` : '<div class="text-gray-400 text-sm">진행중인 티켓이 없습니다.</div>'}
      </div>

      <div class="bg-white rounded-xl border border-gray-200 p-6">
        <h3 class="font-semibold text-gray-800 mb-3">유형별 티켓 현황 (최근 30일)</h3>
        ${ticketsByType.length ? ticketsByType.map(t => `
          <div class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
            <span class="text-sm text-gray-600">${t.typeName}</span>
            <span class="font-semibold">${t._count.id}건</span>
          </div>
        `).join('') : '<div class="text-gray-400 text-sm">데이터가 없습니다.</div>'}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="text-red-500">${err.message}</div>`;
  }
}

// ── 사용자 관리 ───────────────────────────────────────────
let _adminUsersCache = [];

async function renderAdminUsers() {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm">불러오는 중...</div>';
  try {
    const [{ users }, departments] = await Promise.all([
      api('/admin/users'),
      api('/admin/departments'),
    ]);
    _adminUsersCache = users;
    el.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <span class="text-sm text-gray-500">총 ${users.length}명</span>
          <button onclick="showUserCreateModal()" class="flex items-center gap-1.5 bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            사용자 등록
          </button>
        </div>
        <div class="overflow-x-auto"><table class="w-full text-sm">
          <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th class="px-4 py-3 text-left">사번</th>
              <th class="px-4 py-3 text-left">이름</th>
              <th class="px-4 py-3 text-left">이메일</th>
              <th class="px-4 py-3 text-left">부서</th>
              <th class="px-4 py-3 text-left">역할</th>
              <th class="px-4 py-3 text-left">상태</th>
              <th class="px-4 py-3 text-left">관리</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${users.map(u => `
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 font-mono text-xs">${u.employeeId}</td>
                <td class="px-4 py-3 font-medium">${u.name}</td>
                <td class="px-4 py-3 text-gray-500">${u.email}</td>
                <td class="px-4 py-3 text-gray-500">${u.department?.name || '-'}</td>
                <td class="px-4 py-3"><span class="stage-badge role-${u.role}">${roleLabel[u.role]}</span></td>
                <td class="px-4 py-3"><span class="${u.isActive ? 'text-green-600' : 'text-red-400'} text-xs font-medium">${u.isActive ? '활성' : '비활성'}</span></td>
                <td class="px-4 py-3">
                  <button onclick="showUserEditModal('${u.id}')" class="text-xs text-blue-600 hover:underline mr-2">수정</button>
                  <button onclick="toggleUserActive('${u.id}', ${u.isActive})" class="text-xs ${u.isActive ? 'text-red-500 hover:underline' : 'text-green-600 hover:underline'}">${u.isActive ? '비활성화' : '활성화'}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      </div>

      <!-- 사용자 등록 모달 -->
      <div id="user-create-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-gray-800">사용자 등록</h3>
            <button onclick="$('#user-create-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">사번 *</label>
                <input id="uc-empid" type="text" placeholder="예: EMP001" class="form-input" />
              </div>
              <div>
                <label class="form-label">이름 *</label>
                <input id="uc-name" type="text" placeholder="홍길동" class="form-input" />
              </div>
            </div>
            <div>
              <label class="form-label">이메일 *</label>
              <input id="uc-email" type="email" placeholder="user@example.com" class="form-input" />
            </div>
            <div>
              <label class="form-label">비밀번호 *</label>
              <input id="uc-password" type="password" placeholder="8자 이상" class="form-input" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">역할 *</label>
                <select id="uc-role" class="form-select">
                  <option value="USER">일반사용자</option>
                  <option value="APPROVER">결재자</option>
                  <option value="DEVELOPER">개발자</option>
                  <option value="MANAGER">관리자</option>
                  <option value="ADMIN">시스템관리자</option>
                </select>
              </div>
              <div>
                <label class="form-label">부서</label>
                <select id="uc-dept" class="form-select">
                  <option value="">부서 없음</option>
                  ${departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <div class="flex gap-2 mt-5">
            <button onclick="submitCreateUser()" class="flex-1 bg-green-600 text-white text-sm py-2.5 rounded-lg hover:bg-green-700 font-medium">등록</button>
            <button onclick="$('#user-create-modal').classList.add('hidden')" class="flex-1 bg-gray-100 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-200">취소</button>
          </div>
        </div>
      </div>

      <!-- 사용자 수정 모달 -->
      <div id="user-edit-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
          <div class="flex items-center justify-between mb-5">
            <h3 class="text-base font-bold text-gray-800">사용자 수정</h3>
            <button onclick="$('#user-edit-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">사번</label>
                <input id="ue-empid" type="text" class="form-input bg-gray-50" disabled />
              </div>
              <div>
                <label class="form-label">이름 *</label>
                <input id="ue-name" type="text" class="form-input" />
              </div>
            </div>
            <div>
              <label class="form-label">이메일 *</label>
              <input id="ue-email" type="email" class="form-input" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">역할 *</label>
                <select id="ue-role" class="form-select">
                  <option value="USER">일반사용자</option>
                  <option value="APPROVER">결재자</option>
                  <option value="DEVELOPER">개발자</option>
                  <option value="MANAGER">관리자</option>
                  <option value="ADMIN">시스템관리자</option>
                </select>
              </div>
              <div>
                <label class="form-label">부서</label>
                <select id="ue-dept" class="form-select">
                  <option value="">부서 없음</option>
                  ${departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <input id="ue-uid" type="hidden" />
          <div class="flex gap-2 mt-5">
            <button onclick="submitEditUser()" class="flex-1 bg-blue-600 text-white text-sm py-2.5 rounded-lg hover:bg-blue-700 font-medium">저장</button>
            <button onclick="$('#user-edit-modal').classList.add('hidden')" class="flex-1 bg-gray-100 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-200">취소</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="text-red-500">${err.message}</div>`;
  }
}

function showUserCreateModal() {
  ['uc-empid','uc-name','uc-email','uc-password'].forEach(id => { const el = $(`#${id}`); if (el) el.value = ''; });
  $('#uc-role').value = 'USER';
  $('#uc-dept').value = '';
  $('#user-create-modal').classList.remove('hidden');
}

async function submitCreateUser() {
  const employeeId = $('#uc-empid').value.trim();
  const name = $('#uc-name').value.trim();
  const email = $('#uc-email').value.trim();
  const password = $('#uc-password').value;
  const role = $('#uc-role').value;
  const departmentId = $('#uc-dept').value || null;

  if (!employeeId || !name || !email || !password) {
    return showToast('필수 항목을 모두 입력해주세요.', 'error');
  }
  if (password.length < 8) {
    return showToast('비밀번호는 8자 이상이어야 합니다.', 'error');
  }
  try {
    await api('/admin/users', { method: 'POST', body: { employeeId, name, email, password, role, departmentId } });
    $('#user-create-modal').classList.add('hidden');
    showToast('사용자가 등록되었습니다.');
    renderAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showUserEditModal(userId) {
  const u = _adminUsersCache.find(x => x.id === userId);
  if (!u) return;
  $('#ue-uid').value = u.id;
  $('#ue-empid').value = u.employeeId;
  $('#ue-name').value = u.name;
  $('#ue-email').value = u.email;
  $('#ue-role').value = u.role;
  $('#ue-dept').value = u.departmentId || '';
  $('#user-edit-modal').classList.remove('hidden');
}

async function submitEditUser() {
  const id = $('#ue-uid').value;
  const name = $('#ue-name').value.trim();
  const email = $('#ue-email').value.trim();
  const role = $('#ue-role').value;
  const departmentId = $('#ue-dept').value || null;

  if (!name || !email) return showToast('이름과 이메일을 입력해주세요.', 'error');
  try {
    await api(`/admin/users/${id}`, { method: 'PATCH', body: { name, email, role, departmentId } });
    $('#user-edit-modal').classList.add('hidden');
    showToast('사용자 정보가 수정되었습니다.');
    renderAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleUserActive(id, currentlyActive) {
  const action = currentlyActive ? '비활성화' : '활성화';
  if (!confirm(`이 사용자를 ${action}하시겠습니까?`)) return;
  try {
    await api(`/admin/users/${id}`, { method: 'PATCH', body: { isActive: !currentlyActive } });
    showToast(`사용자가 ${action}되었습니다.`);
    renderAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── 운영 이관 ─────────────────────────────────────────────

const deployStatusLabel = { DRAFT:'계획작성중', READY:'이관준비완료', DEPLOYED:'이관완료', FAILED:'이관실패', ROLLBACK:'롤백', CANCELLED:'취소' };
const deployStatusColor = { DRAFT:'bg-gray-100 text-gray-600', READY:'bg-blue-100 text-blue-700', DEPLOYED:'bg-green-100 text-green-700', FAILED:'bg-red-100 text-red-600', ROLLBACK:'bg-orange-100 text-orange-700', CANCELLED:'bg-gray-100 text-gray-400' };
const deployResultLabel = { SUCCESS:'성공', PARTIAL:'부분성공', FAILED:'실패', ROLLBACK:'롤백' };
const deployResultColor = { SUCCESS:'bg-green-100 text-green-700', PARTIAL:'bg-yellow-100 text-yellow-700', FAILED:'bg-red-100 text-red-600', ROLLBACK:'bg-orange-100 text-orange-700' };
const categoryIcon = { '개발':'💻', '테스트':'🧪', '보안':'🔒', '문서':'📄', '계획':'📋', '확인':'✅' };

async function loadDeployment(ticket) {
  const section = $('#deploy-section');
  const el = $('#deploy-content');
  const badge = $('#deploy-status-badge');
  if (!section || !el) return;

  // 역할 체크: DEVELOPER, MANAGER, ADMIN만 접근 가능
  if (!['DEVELOPER', 'MANAGER', 'ADMIN'].includes(currentUser.role)) {
    section.classList.add('hidden');
    return;
  }

  // 워크플로우에 '배포대상검토' 단계가 없으면 해당 없음 (DATA, DATAMOD 등)
  const stages = ticket.ticketType.workflowStages;
  const deployStageInfo = stages.find(s => s.name === '배포대상검토');
  if (!deployStageInfo) {
    section.classList.add('hidden');
    return;
  }

  const ticketId = ticket.id;
  const currentOrder = ticket.currentStage?.stageOrder ?? 0;

  try {
    const plan = await api(`/tickets/${ticketId}/deployment`);

    // 이관 계획서가 없고 아직 배포대상검토 단계 미도달이면 숨김
    if (!plan && currentOrder < deployStageInfo.stageOrder && ticket.status !== 'COMPLETED') {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');

    if (!plan) {
      el.innerHTML = `
        <div class="text-sm text-gray-400 mb-4">등록된 이관 계획서가 없습니다.</div>
        <button onclick="showDeployForm('${ticketId}')" class="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">이관 계획서 등록</button>
        <div id="deploy-plan-form" class="hidden mt-4 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="text-xs text-gray-500 mb-1 block">이관 대상 시스템 *</label>
              <input id="dp-target" type="text" placeholder="예: 인사관리시스템" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
            <div><label class="text-xs text-gray-500 mb-1 block">이관 유형 *</label>
              <select id="dp-type" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="전체배포">전체 배포</option>
                <option value="부분배포">부분 배포</option>
                <option value="긴급배포">긴급 배포</option>
                <option value="DB변경">DB 변경</option>
                <option value="설정변경">설정 변경</option>
              </select></div>
          </div>
          <div><label class="text-xs text-gray-500 mb-1 block">이관 예정일시 *</label>
            <input id="dp-date" type="datetime-local" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" /></div>
          <div><label class="text-xs text-gray-500 mb-1 block">이관 내용 *</label>
            <textarea id="dp-desc" rows="3" placeholder="이관 내용 및 변경 사항을 상세히 기술하세요" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"></textarea></div>
          <div class="flex gap-2">
            <button onclick="submitDeployPlan('${ticketId}')" class="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700">등록 및 체크리스트 생성</button>
            <button onclick="$('#deploy-plan-form').classList.add('hidden')" class="text-sm text-gray-500 hover:text-gray-700">취소</button>
          </div>
        </div>`;
      if (badge) badge.innerHTML = '';
      return;
    }

    if (badge) badge.innerHTML = `<span class="text-xs px-2 py-0.5 rounded font-medium ${deployStatusColor[plan.status]}">${deployStatusLabel[plan.status]}</span>`;

    const checkedCount = plan.checklist.filter(i => i.isChecked).length;
    const mandatoryTotal = plan.checklist.filter(i => i.isMandatory).length;
    const mandatoryChecked = plan.checklist.filter(i => i.isMandatory && i.isChecked).length;
    const allMandatoryDone = mandatoryChecked === mandatoryTotal;

    // 카테고리별 그룹핑
    const grouped = {};
    plan.checklist.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    el.innerHTML = `
      <!-- 계획서 요약 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 p-4 bg-indigo-50 rounded-xl text-sm">
        <div><div class="text-xs text-gray-400 mb-0.5">이관 대상</div><div class="font-semibold text-gray-800">${plan.deployTarget}</div></div>
        <div><div class="text-xs text-gray-400 mb-0.5">이관 유형</div><div class="font-semibold text-gray-800">${plan.deployType}</div></div>
        <div><div class="text-xs text-gray-400 mb-0.5">예정 일시</div><div class="font-semibold text-gray-800">${formatDate(plan.plannedAt)}</div></div>
        <div><div class="text-xs text-gray-400 mb-0.5">등록자</div><div class="font-semibold text-gray-800">${plan.createdBy.name}</div></div>
      </div>
      <div class="mb-1 text-xs text-gray-500 p-3 bg-gray-50 rounded-lg">${plan.description}</div>

      <!-- 체크리스트 진행률 -->
      <div class="mt-4 mb-3">
        <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>체크리스트 ${checkedCount} / ${plan.checklist.length}건 완료 (필수 ${mandatoryChecked}/${mandatoryTotal})</span>
          <span class="font-semibold ${allMandatoryDone ? 'text-green-600' : 'text-indigo-600'}">${Math.round((checkedCount/plan.checklist.length)*100)}%</span>
        </div>
        <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full ${allMandatoryDone ? 'bg-green-500' : 'bg-indigo-500'} transition-all" style="width:${Math.round((checkedCount/plan.checklist.length)*100)}%"></div>
        </div>
      </div>

      <!-- 체크리스트 항목 -->
      <div class="space-y-3 mb-5">
        ${Object.entries(grouped).map(([cat, items]) => `
          <div>
            <div class="text-xs font-semibold text-gray-500 mb-1.5">${categoryIcon[cat] || '•'} ${cat}</div>
            <div class="space-y-1.5 pl-4">
              ${items.map(item => `
                <label class="flex items-start gap-3 cursor-pointer group">
                  <input type="checkbox" ${item.isChecked ? 'checked' : ''} ${plan.status === 'DEPLOYED' || plan.status === 'CANCELLED' ? 'disabled' : ''}
                    onchange="toggleChecklist('${item.id}','${ticketId}')"
                    class="mt-0.5 w-4 h-4 accent-indigo-600 shrink-0" />
                  <div class="flex-1">
                    <span class="text-sm ${item.isChecked ? 'text-gray-400 line-through' : 'text-gray-700'}">${item.itemText}</span>
                    ${item.isMandatory ? '<span class="text-xs text-red-500 ml-1">*</span>' : ''}
                    ${item.isChecked && item.checkedBy ? `<div class="text-xs text-gray-400 mt-0.5">✓ ${item.checkedBy.name} · ${formatDate(item.checkedAt)}</div>` : ''}
                  </div>
                </label>`).join('')}
            </div>
          </div>`).join('')}
      </div>

      <!-- 액션 버튼 -->
      ${plan.status === 'DRAFT' ? `
        <div class="flex gap-2 pt-3 border-t border-gray-100">
          <button onclick="setDeployReady('${ticketId}')" class="${allMandatoryDone ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-300 cursor-not-allowed'} text-white text-sm px-4 py-2 rounded-lg transition" ${allMandatoryDone ? '' : 'disabled'}>
            이관 준비 완료 선언
          </button>
          ${!allMandatoryDone ? `<span class="text-xs text-red-500 self-center">필수 항목 ${mandatoryTotal - mandatoryChecked}건 미완료</span>` : ''}
        </div>` : ''}
      ${plan.status === 'READY' ? `
        <div class="pt-3 border-t border-gray-100">
          <div class="font-semibold text-sm text-gray-700 mb-3">이관 결과 기록</div>
          <div class="flex gap-2 flex-wrap">
            ${['SUCCESS','PARTIAL','FAILED','ROLLBACK'].map(s => `
              <button onclick="recordDeployResult('${ticketId}','${s}')" class="text-sm px-4 py-2 rounded-lg font-medium ${deployResultColor[s]} hover:opacity-80 border border-transparent">${deployResultLabel[s]}</button>`).join('')}
          </div>
        </div>` : ''}
      ${plan.result ? `
        <div class="mt-4 p-4 rounded-xl ${deployResultColor[plan.result.status]}">
          <div class="font-semibold text-sm mb-1">이관 결과: ${deployResultLabel[plan.result.status]}</div>
          <div class="text-xs">실행자: ${plan.result.deployedBy.name} · ${formatDate(plan.result.deployedAt)}</div>
          ${plan.result.resultNote ? `<div class="text-sm mt-1">${plan.result.resultNote}</div>` : ''}
          ${plan.result.rollbackNote ? `<div class="text-sm mt-1 text-orange-700">롤백 사유: ${plan.result.rollbackNote}</div>` : ''}
        </div>` : ''}`;
  } catch (err) { el.innerHTML = `<div class="text-red-500 text-sm">${err.message}</div>`; }
}

function showDeployForm(ticketId) {
  $('#deploy-plan-form')?.classList.toggle('hidden');
}

async function submitDeployPlan(ticketId) {
  const target = $('#dp-target').value.trim();
  const type = $('#dp-type').value;
  const date = $('#dp-date').value;
  const desc = $('#dp-desc').value.trim();
  if (!target || !date || !desc) { toast('모든 필수 항목을 입력해주세요.', 'error'); return; }
  try {
    await api(`/tickets/${ticketId}/deployment`, {
      method: 'POST',
      body: { deployTarget: target, deployType: type, plannedAt: date, description: desc },
    });
    toast('이관 계획서가 등록되었습니다. 체크리스트를 확인하세요.');
    loadDeployment(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleChecklist(itemId, ticketId) {
  try {
    await api(`/tickets/deployment/checklist/${itemId}`, { method: 'PATCH', body: {} });
    loadDeployment(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function setDeployReady(ticketId) {
  try {
    await api(`/tickets/${ticketId}/deployment/ready`, { method: 'PATCH', body: {} });
    toast('이관 준비 완료로 변경되었습니다.');
    loadDeployment(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

async function recordDeployResult(ticketId, status) {
  const resultNote = prompt(`결과 메모를 입력하세요 (${deployResultLabel[status]}):`);
  if (resultNote === null) return;
  const rollbackNote = (status === 'ROLLBACK' || status === 'FAILED') ? prompt('롤백/실패 사유를 입력하세요:') : null;
  if ((status === 'ROLLBACK' || status === 'FAILED') && rollbackNote === null) return;
  try {
    await api(`/tickets/${ticketId}/deployment/result`, {
      method: 'POST',
      body: { status, resultNote, rollbackNote },
    });
    toast(`이관 결과(${deployResultLabel[status]})가 기록되었습니다.`);
    loadDeployment(ticketId);
  } catch (err) { toast(err.message, 'error'); }
}

// ── 결함 관리 (관리자) ────────────────────────────────────
async function renderAdminDefects() {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm">불러오는 중...</div>';
  try {
    const { defects } = await api('/tests/defects');
    const openCount     = defects.filter(d => d.status === 'OPEN').length;
    const inProgCount   = defects.filter(d => d.status === 'IN_PROGRESS').length;
    const resolvedCount = defects.filter(d => d.status === 'RESOLVED' || d.status === 'CLOSED').length;
    const critCount     = defects.filter(d => d.severity === 'CRITICAL' || d.severity === 'HIGH').length;

    el.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${summaryCard('전체 결함', defects.length, 'blue')}
        ${summaryCard('신규', openCount, 'yellow')}
        ${summaryCard('처리중', inProgCount, 'blue')}
        ${summaryCard('해결/종료', resolvedCount, 'green')}
      </div>
      ${critCount > 0 ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">⚠ 긴급/높음 심각도 결함이 <strong>${critCount}건</strong> 있습니다.</div>` : ''}
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <select id="df-filter-status" onchange="filterDefectsTable()" class="form-select text-sm">
            <option value="">전체 상태</option>
            ${['OPEN','IN_PROGRESS','RESOLVED','CLOSED','REJECTED'].map(s=>`<option value="${s}">${dfStatusLabel[s]}</option>`).join('')}
          </select>
          <select id="df-filter-sev" onchange="filterDefectsTable()" class="form-select text-sm">
            <option value="">전체 심각도</option>
            ${['CRITICAL','HIGH','MEDIUM','LOW'].map(s=>`<option value="${s}">${dfSeverityLabel[s]}</option>`).join('')}
          </select>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm" id="defects-admin-table">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left">결함 제목</th>
                <th class="px-4 py-3 text-left">심각도</th>
                <th class="px-4 py-3 text-left">상태</th>
                <th class="px-4 py-3 text-left">관련 티켓</th>
                <th class="px-4 py-3 text-left">보고자</th>
                <th class="px-4 py-3 text-left">담당자</th>
                <th class="px-4 py-3 text-left">등록일</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${defects.map(d => `
                <tr data-status="${d.status}" data-severity="${d.severity}" class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium">${d.title}</td>
                  <td class="px-4 py-3"><span class="text-xs px-2 py-0.5 rounded font-medium ${dfSeverityColor[d.severity]}">${dfSeverityLabel[d.severity]}</span></td>
                  <td class="px-4 py-3"><span class="text-xs px-2 py-0.5 rounded font-medium bg-gray-100 text-gray-600">${dfStatusLabel[d.status]}</span></td>
                  <td class="px-4 py-3">
                    ${d.ticket ? `<button onclick="navigate('ticket-detail',{id:'${d.ticket.id}'})" class="font-mono text-xs text-blue-600 hover:underline">${d.ticket.ticketNumber}</button>` : '-'}
                  </td>
                  <td class="px-4 py-3 text-gray-500">${d.reporter.name}</td>
                  <td class="px-4 py-3 text-gray-500">${d.assignee?.name || '-'}</td>
                  <td class="px-4 py-3 text-xs text-gray-400">${formatDate(d.createdAt)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div class="text-red-500">${err.message}</div>`;
  }
}

function filterDefectsTable() {
  const statusVal = $('#df-filter-status')?.value;
  const sevVal    = $('#df-filter-sev')?.value;
  $$('#defects-admin-table tbody tr').forEach(row => {
    const matchStatus = !statusVal || row.dataset.status === statusVal;
    const matchSev    = !sevVal    || row.dataset.severity === sevVal;
    row.style.display = matchStatus && matchSev ? '' : 'none';
  });
}

// ── 이관 현황 (관리자) ────────────────────────────────────
async function renderAdminDeployments() {
  const el = $('#page-content');
  el.innerHTML = '<div class="text-gray-400 text-sm">불러오는 중...</div>';
  try {
    const plans = await api('/admin/deployments');
    const byStatus = (s) => plans.filter(p => p.status === s).length;

    el.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${summaryCard('전체', plans.length, 'blue')}
        ${summaryCard('준비완료', byStatus('READY'), 'yellow')}
        ${summaryCard('이관완료', byStatus('DEPLOYED'), 'green')}
        ${summaryCard('실패/롤백', byStatus('FAILED') + byStatus('ROLLBACK'), 'blue')}
      </div>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left">관련 티켓</th>
                <th class="px-4 py-3 text-left">이관 대상</th>
                <th class="px-4 py-3 text-left">유형</th>
                <th class="px-4 py-3 text-left">예정일시</th>
                <th class="px-4 py-3 text-left">체크리스트</th>
                <th class="px-4 py-3 text-left">상태</th>
                <th class="px-4 py-3 text-left">결과</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${plans.length ? plans.map(p => `
                <tr class="hover:bg-gray-50 cursor-pointer" onclick="navigate('ticket-detail',{id:'${p.ticket.id}'})">
                  <td class="px-4 py-3">
                    <div class="font-mono text-xs text-blue-600">${p.ticket.ticketNumber}</div>
                    <div class="text-xs text-gray-500 truncate max-w-xs">${p.ticket.title}</div>
                  </td>
                  <td class="px-4 py-3 font-medium">${p.deployTarget}</td>
                  <td class="px-4 py-3 text-gray-500 text-xs">${p.deployType}</td>
                  <td class="px-4 py-3 text-xs text-gray-500">${formatDate(p.plannedAt)}</td>
                  <td class="px-4 py-3 text-xs text-gray-500">${p._count.checklist}개 항목</td>
                  <td class="px-4 py-3"><span class="text-xs px-2 py-0.5 rounded font-medium ${deployStatusColor[p.status]}">${deployStatusLabel[p.status]}</span></td>
                  <td class="px-4 py-3">${p.result ? `<span class="text-xs px-2 py-0.5 rounded font-medium ${deployResultColor[p.result.status]}">${deployResultLabel[p.result.status]}</span>` : '-'}</td>
                </tr>`).join('') : '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">등록된 이관 계획이 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="text-red-500">${err.message}</div>`;
  }
}

// ── 감사 로그 (관리자) ────────────────────────────────────

const auditActionLabel = {
  LOGIN: '로그인', LOGIN_FAILED: '로그인 실패', CHANGE_PASSWORD: '비밀번호 변경',
  CREATE_TICKET: '티켓 등록', PROCESS_STAGE: '단계 처리', ADD_COMMENT: '댓글 등록',
  CREATE_REQUIREMENT: '요구사항 등록', UPDATE_REQUIREMENT: '요구사항 수정', CHANGE_REQUIREMENT_STATUS: '요구사항 상태변경',
  CREATE_TEST_CASE: '테스트케이스 등록', EXECUTE_TEST: '테스트 실행', DELETE_TEST_CASE: '테스트케이스 삭제',
  CREATE_DEFECT: '결함 등록', UPDATE_DEFECT: '결함 수정',
  CREATE_DEPLOYMENT: '이관계획 등록', TOGGLE_CHECKLIST: '체크리스트 확인', SET_DEPLOYMENT_READY: '이관준비완료', RECORD_DEPLOYMENT_RESULT: '이관결과 기록',
};
const auditActionColor = {
  LOGIN: 'bg-green-100 text-green-700', LOGIN_FAILED: 'bg-red-100 text-red-600',
  CREATE_TICKET: 'bg-blue-100 text-blue-700', PROCESS_STAGE: 'bg-indigo-100 text-indigo-700',
  CREATE_DEPLOYMENT: 'bg-purple-100 text-purple-700', RECORD_DEPLOYMENT_RESULT: 'bg-purple-100 text-purple-700',
  CREATE_DEFECT: 'bg-red-100 text-red-600', UPDATE_DEFECT: 'bg-orange-100 text-orange-700',
};

let auditPage = 1;
let auditFilters = {};

async function renderAdminAudit() {
  const el = $('#page-content');
  auditPage = 1;
  auditFilters = {};
  el.innerHTML = `
    <div class="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <div class="flex flex-wrap gap-3 items-end">
        <div>
          <label class="text-xs text-gray-500 block mb-1">액션</label>
          <select id="af-action" class="form-select text-sm min-w-[140px]">
            <option value="">전체</option>
            ${Object.entries(auditActionLabel).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">엔티티 유형</label>
          <select id="af-entity" class="form-select text-sm">
            <option value="">전체</option>
            ${['TICKET','REQUIREMENT','TEST_CASE','DEFECT','DEPLOYMENT','USER'].map(e => `<option value="${e}">${e}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">시작일</label>
          <input id="af-from" type="date" class="form-input text-sm" />
        </div>
        <div>
          <label class="text-xs text-gray-500 block mb-1">종료일</label>
          <input id="af-to" type="date" class="form-input text-sm" />
        </div>
        <button onclick="applyAuditFilter()" class="bg-gray-800 text-white text-sm px-4 py-2 rounded-lg hover:bg-gray-700">검색</button>
        <button onclick="resetAuditFilter()" class="text-sm text-gray-500 hover:text-gray-700 px-2 py-2">초기화</button>
      </div>
    </div>
    <div id="audit-table-wrap"></div>`;
  await loadAuditLogs();
}

async function loadAuditLogs() {
  const el = $('#audit-table-wrap');
  if (!el) return;
  el.innerHTML = '<div class="text-gray-400 text-sm p-4">불러오는 중...</div>';
  try {
    const params = new URLSearchParams({ page: auditPage, limit: 50, ...auditFilters });
    const { logs, total } = await api(`/admin/audit-logs?${params}`);
    const totalPages = Math.ceil(total / 50);

    el.innerHTML = `
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100 text-xs text-gray-400">총 ${total.toLocaleString()}건 · ${auditPage}/${totalPages} 페이지</div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th class="px-4 py-3 text-left">일시</th>
                <th class="px-4 py-3 text-left">사용자</th>
                <th class="px-4 py-3 text-left">역할</th>
                <th class="px-4 py-3 text-left">액션</th>
                <th class="px-4 py-3 text-left">대상</th>
                <th class="px-4 py-3 text-left">IP</th>
                <th class="px-4 py-3 text-left">상세</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${logs.length ? logs.map(l => `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">${formatDate(l.createdAt)}</td>
                  <td class="px-4 py-2 font-medium text-sm">${l.userName || '-'}</td>
                  <td class="px-4 py-2 text-xs text-gray-400">${l.userRole ? roleLabel[l.userRole] || l.userRole : '-'}</td>
                  <td class="px-4 py-2">
                    <span class="text-xs px-2 py-0.5 rounded font-medium ${auditActionColor[l.action] || 'bg-gray-100 text-gray-600'}">
                      ${auditActionLabel[l.action] || l.action}
                    </span>
                  </td>
                  <td class="px-4 py-2">
                    ${l.entityType ? `<span class="text-xs text-gray-400">${l.entityType}</span>` : ''}
                    ${l.entityLabel ? `<span class="text-xs font-medium ml-1">${l.entityLabel}</span>` : ''}
                  </td>
                  <td class="px-4 py-2 text-xs text-gray-400 font-mono">${l.ipAddress || '-'}</td>
                  <td class="px-4 py-2">
                    ${(l.newValues || l.oldValues) ? `
                      <button onclick="toggleAuditDetail('${l.id}')" class="text-xs text-blue-500 hover:underline">상세</button>
                      <div id="audit-detail-${l.id}" class="hidden mt-1 text-xs bg-gray-50 rounded p-2 max-w-xs">
                        ${l.oldValues ? `<div class="text-gray-400 mb-0.5">이전: ${JSON.stringify(l.oldValues)}</div>` : ''}
                        ${l.newValues ? `<div class="text-gray-600">변경: ${JSON.stringify(l.newValues)}</div>` : ''}
                      </div>` : ''}
                  </td>
                </tr>`).join('') : '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">데이터가 없습니다.</td></tr>'}
            </tbody>
          </table>
        </div>
        ${totalPages > 1 ? `
          <div class="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <button onclick="auditChangePage(${auditPage - 1})" ${auditPage <= 1 ? 'disabled' : ''} class="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30">← 이전</button>
            <span class="text-xs text-gray-400">${auditPage} / ${totalPages}</span>
            <button onclick="auditChangePage(${auditPage + 1})" ${auditPage >= totalPages ? 'disabled' : ''} class="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30">다음 →</button>
          </div>` : ''}
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="text-red-500 p-4">${err.message}</div>`;
  }
}

function toggleAuditDetail(id) {
  $(`#audit-detail-${id}`)?.classList.toggle('hidden');
}

function applyAuditFilter() {
  auditPage = 1;
  auditFilters = {};
  const action = $('#af-action')?.value;
  const entity = $('#af-entity')?.value;
  const from = $('#af-from')?.value;
  const to = $('#af-to')?.value;
  if (action) auditFilters.action = action;
  if (entity) auditFilters.entityType = entity;
  if (from) auditFilters.from = from;
  if (to) auditFilters.to = to;
  loadAuditLogs();
}

function resetAuditFilter() {
  auditPage = 1;
  auditFilters = {};
  ['#af-action','#af-entity','#af-from','#af-to'].forEach(s => { if ($(s)) $(s).value = ''; });
  loadAuditLogs();
}

function auditChangePage(page) {
  auditPage = page;
  loadAuditLogs();
}

// ── 도메인-IT BA 매핑 관리 ───────────────────────────────────
async function renderAdminDomainItba() {
  const el = $('#page-content');
  el.innerHTML = `
    <div class="max-w-3xl mx-auto space-y-6">
      <div class="bg-white rounded-xl border border-gray-200 p-5">
        <h3 class="text-sm font-semibold text-gray-700 mb-4">도메인 매핑 추가 / 변경</h3>
        <div class="flex gap-3 items-end flex-wrap">
          <div class="flex-1 min-w-[180px]">
            <label class="text-xs text-gray-500 block mb-1">업무 도메인</label>
            <select id="dim-domain" class="form-select text-sm w-full">
              <option value="">선택하세요</option>
              ${CHAT_BIZ_DOMAINS.map(d => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </div>
          <div class="flex-1 min-w-[220px]">
            <label class="text-xs text-gray-500 block mb-1">담당 IT BA</label>
            <div class="relative">
              <input id="dim-ba-inp" type="text" placeholder="이름으로 검색..." autocomplete="off"
                class="form-input text-sm w-full" />
              <div id="dim-ba-dd" class="user-dropdown hidden"></div>
            </div>
            <div id="dim-ba-tag" class="hidden mt-1.5 flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <span id="dim-ba-txt" class="flex-1 font-medium text-blue-800"></span>
              <button type="button" onclick="dimClearBa()" class="text-gray-400 hover:text-red-500">&times;</button>
            </div>
          </div>
          <button onclick="dimSave()" class="nh-btn px-5 py-2 rounded-lg text-white text-sm font-medium">저장</button>
        </div>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div class="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span class="text-sm font-semibold text-gray-700">매핑 목록</span>
          <span id="dim-count" class="text-xs text-gray-400"></span>
        </div>
        <div id="dim-list">
          <div class="px-5 py-8 text-center text-gray-400 text-sm">불러오는 중...</div>
        </div>
      </div>
    </div>`;

  let dimBaUser = null;

  window.dimClearBa = function() {
    dimBaUser = null;
    $('#dim-ba-tag').classList.add('hidden');
    $('#dim-ba-inp').value = '';
    $('#dim-ba-inp').placeholder = '이름으로 검색...';
  };

  chatSetupUserDD('#dim-ba-inp', '#dim-ba-dd', '/common/users/it-ba', user => {
    dimBaUser = user;
    $('#dim-ba-txt').textContent = `${user.name} (${user.department?.name || roleLabel[user.role]})`;
    $('#dim-ba-tag').classList.remove('hidden');
    $('#dim-ba-inp').value = ''; $('#dim-ba-inp').placeholder = '';
    $('#dim-ba-dd').classList.add('hidden');
  });

  window.dimSave = async function() {
    const domain = $('#dim-domain').value;
    if (!domain) { toast('도메인을 선택해주세요.', 'error'); return; }
    if (!dimBaUser) { toast('IT BA를 선택해주세요.', 'error'); return; }
    try {
      await api('/admin/domain-itba-mappings', { method: 'POST', body: { domain, itbaId: dimBaUser.id } });
      toast('저장되었습니다.');
      $('#dim-domain').value = '';
      dimClearBa();
      await dimLoadList();
    } catch (err) { toast(err.message, 'error'); }
  };

  window.dimDelete = async function(id, domain) {
    if (!confirm(`"${domain}" 매핑을 삭제할까요?`)) return;
    try {
      await api(`/admin/domain-itba-mappings/${id}`, { method: 'DELETE' });
      toast('삭제되었습니다.');
      await dimLoadList();
    } catch (err) { toast(err.message, 'error'); }
  };

  async function dimLoadList() {
    const listEl = $('#dim-list');
    if (!listEl) return;
    try {
      const mappings = await api('/admin/domain-itba-mappings');
      $('#dim-count').textContent = `총 ${mappings.length}건`;
      if (!mappings.length) {
        listEl.innerHTML = '<div class="px-5 py-8 text-center text-gray-400 text-sm">등록된 매핑이 없습니다.</div>';
        return;
      }
      listEl.innerHTML = `
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th class="px-5 py-3 text-left">업무 도메인</th>
              <th class="px-5 py-3 text-left">담당 IT BA</th>
              <th class="px-5 py-3 text-left">소속 부서</th>
              <th class="px-5 py-3 text-left">역할</th>
              <th class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            ${mappings.map(m => `
              <tr class="hover:bg-gray-50">
                <td class="px-5 py-3 font-medium">${m.domain}</td>
                <td class="px-5 py-3">${m.itba?.name || '-'}</td>
                <td class="px-5 py-3 text-gray-500">${m.itba?.department?.name || '-'}</td>
                <td class="px-5 py-3 text-gray-500">${roleLabel[m.itba?.role] || m.itba?.role || '-'}</td>
                <td class="px-5 py-3 text-right">
                  <button onclick="dimDelete('${m.id}','${m.domain}')"
                    class="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded">삭제</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    } catch (err) {
      listEl.innerHTML = `<div class="px-5 py-4 text-red-500 text-sm">${err.message}</div>`;
    }
  }

  await dimLoadList();
}

// ── 앱 시작 ───────────────────────────────────────────────
(function init() {
  // 모달 오버레이 클릭 시 닫기
  document.getElementById('modal-overlay')?.addEventListener('click', function(e) {
    if (e.target === this) closeExecModal();
  });

  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (token && user) {
    try {
      initApp(JSON.parse(user));
    } catch {
      localStorage.clear();
      $('#login-screen').classList.remove('hidden');
    }
  } else {
    $('#login-screen').classList.remove('hidden');
  }
})();
