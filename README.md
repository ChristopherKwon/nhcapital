# ITSM - IT 서비스 관리 시스템

사내 IT 개발 요청, 자료 요청, 변경 관리 등을 통합 관리하는 웹 기반 ITSM 시스템입니다.

## 기술 스택

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Frontend**: HTML, Tailwind CSS, Vanilla JS
- **AI**: Anthropic Claude API (난이도 분석, 유사 티켓 검색)

---

## 개발 환경

### 운영체제
- Windows 10/11, macOS 13+, Ubuntu 22.04+ 모두 지원
- 아래 명령어는 Windows(PowerShell/CMD)와 Mac/Linux 모두 동일하게 사용 가능합니다.  
  단, 일부 명령어(DB 생성 등)는 OS별 차이가 있으며 해당 부분에 별도 안내가 있습니다.

### 권장 IDE
- [VS Code](https://code.visualstudio.com/) 권장
- 추천 확장: Prisma, ESLint, Prettier, Thunder Client

### Runtime / 플랫폼 버전

| 항목 | 최소 버전 | 개발 환경 버전 |
|------|-----------|----------------|
| Node.js | v18.x | v24.15.0 |
| npm | v8.x | v11.x |
| PostgreSQL | v14.x | v16.13 |

### 주요 패키지 버전

| 패키지 | 버전 |
|--------|------|
| express | ^4.19.2 |
| prisma | ^5.14.0 |
| @prisma/client | ^5.14.0 |
| @anthropic-ai/sdk | ^0.95.2 |
| socket.io | ^4.7.5 |
| bcryptjs | ^2.4.3 |
| jsonwebtoken | ^9.0.2 |
| multer | ^1.4.5-lts.1 |
| pgvector | ^0.2.1 |
| dotenv | ^16.4.5 |
| nodemon (dev) | ^3.1.4 |

---

## 시작하기

### 사전 준비

- [Node.js](https://nodejs.org) v18 이상 ([다운로드](https://nodejs.org/en/download))
- [PostgreSQL](https://www.postgresql.org/download) v14 이상

### 1. 프로젝트 받기

```bash
git clone https://github.com/ChristopherKwon/nhcapital.git
cd nhcapital
```

### 2. 패키지 설치

```bash
npm install
```

### 3. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성합니다.

```env
DATABASE_URL="postgresql://유저명:비밀번호@localhost:5432/itsm_db"
JWT_SECRET="임의의_문자열_입력"
JWT_EXPIRES_IN="8h"
PORT=3000
NODE_ENV=development
UPLOAD_PATH="./uploads"
MAX_FILE_SIZE=10485760
```

AI 기능을 사용하려면 Anthropic API 키를 추가합니다.

```env
ANTHROPIC_API_KEY="sk-ant-..."
AI_PROVIDER="claude"
```

### 4. 데이터베이스 생성

PostgreSQL에서 DB를 생성합니다.

```bash
# Windows (psql 실행 후)
CREATE DATABASE itsm_db;

# Mac / Linux
createdb itsm_db
```

### 5. 테이블 생성 (마이그레이션)

```bash
npx prisma migrate deploy
```

### 6. 초기 데이터 입력

```bash
npm run db:seed
```

### 7. 서버 실행

```bash
# 운영
npm start

# 개발 (파일 변경 시 자동 재시작)
npm run dev
```

브라우저에서 `http://localhost:3000` 접속

---

## 테스트 계정

| 역할 | 사번 | 비밀번호 |
|------|------|----------|
| 관리자 | ADMIN001 | Admin1234! |
| IT 책임자 | MGR001 | Manager1234! |
| IT 팀장 (결재자) | APR001 | Approver1234! |
| 개발자 (IT BA) | DEV001 | Dev1234! |
| 일반 사용자 | USR001 | User1234! |

---

## 주요 기능

- **티켓 관리**: 통합전산개발요청 / 자료요청 / 자료수정 / 변경관리
- **워크플로우**: 역할 기반 단계별 승인 처리
- **요구사항 관리**: 요구사항 등록 / IT BA 검토 상태 추적 (수용 / 협의 중 / 보류 / 불가)
- **도메인-IT BA 자동 배정**: 업무 도메인 선택 시 담당 IT BA 자동 매핑
- **프로그램 영향도 분석**: IT BA 전용 개발 대상 프로그램 등록
- **AI 기능**: 개발 난이도 자동 분석, 유사 티켓 검색
- **운영 이관 관리**: 배포 체크리스트 및 결과 기록
- **감사 로그**: 전체 사용자 행위 이력 관리

---

## 유용한 명령어

```bash
# DB 마이그레이션 생성 (스키마 변경 시)
npm run db:migrate

# 초기 데이터 재입력
npm run db:seed

# Prisma Studio (DB GUI)
npm run db:studio
```
