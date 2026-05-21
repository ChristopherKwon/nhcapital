-- =============================================================================
-- Migration: 20260521000001_sync_feature_branch
-- Branch   : feature/my-work  ← main 브랜치 머지 후 스키마 동기화
-- Date     : 2026-05-21
-- Author   : ji-hoooon
-- =============================================================================
--
-- [변경 배경]
--   main 브랜치(20260521000000_init)가 전체 재초기화 SQL로 작성되어
--   기존 DB(migrations 01~15)에 그대로 적용할 수 없었음.
--   이 파일은 기존 마이그레이션 누락분을 개별 ALTER/CREATE 로 적용한 실제 델타.
--
-- [변경 이력]
--   2026-05-21  최초 작성 — main 머지 후 수동 적용분 마이그레이션 파일로 정리
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- [1] pgvector 확장 설치
--     tickets.embedding(vector) 컬럼 사용을 위해 필요
--     변경일: 2026-05-21
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;


-- -----------------------------------------------------------------------------
-- [2] tickets 테이블 — AI 분석 및 비즈니스 도메인 컬럼 추가
--     main 브랜치에서 추가된 필드들로, 기존 migrations 01~15에 누락되어 있던 항목
--     변경일: 2026-05-21
-- -----------------------------------------------------------------------------

-- 비즈니스 도메인 (티켓 등록 시 도메인-IT BA 자동 배정에 사용)
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "businessDomain" TEXT;

-- AI 난이도 분석 결과 (Anthropic API 호출 결과 저장)
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "embedding"             vector(1536);
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "aiEstimatedDifficulty" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "aiEstimatedDays"       TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "aiDifficultyReason"    TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "finalDifficulty"       TEXT;

-- IT BA 추가 분석 항목
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "externalInterfaceCount" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "dbChangeRequired"       BOOLEAN;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "itbaDifficultyOverride" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "isCustomerFacing"       BOOLEAN;


-- -----------------------------------------------------------------------------
-- [3] ticket_watchers 테이블 신규 생성
--     티켓 참조자(관심자) 관리 기능
--     변경일: 2026-05-21
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ticket_watchers" (
    "id"        TEXT        NOT NULL,
    "ticketId"  TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "addedById" TEXT        NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_watchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ticket_watchers_ticketId_userId_key"
    ON "ticket_watchers"("ticketId", "userId");

ALTER TABLE "ticket_watchers"
    ADD CONSTRAINT "ticket_watchers_ticketId_fkey"
        FOREIGN KEY ("ticketId")  REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_watchers"
    ADD CONSTRAINT "ticket_watchers_userId_fkey"
        FOREIGN KEY ("userId")    REFERENCES "users"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ticket_watchers"
    ADD CONSTRAINT "ticket_watchers_addedById_fkey"
        FOREIGN KEY ("addedById") REFERENCES "users"("id")   ON DELETE RESTRICT ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- [4] domain_itba_mappings 테이블 신규 생성
--     비즈니스 도메인별 IT BA 담당자 매핑 (자동 배정 기준 테이블)
--     변경일: 2026-05-21
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "domain_itba_mappings" (
    "id"        TEXT        NOT NULL,
    "domain"    TEXT        NOT NULL,
    "itbaId"    TEXT        NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_itba_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "domain_itba_mappings_domain_key"
    ON "domain_itba_mappings"("domain");

ALTER TABLE "domain_itba_mappings"
    ADD CONSTRAINT "domain_itba_mappings_itbaId_fkey"
        FOREIGN KEY ("itbaId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- [5] requirement_files 테이블 신규 생성
--     요구사항 첨부 파일 관리
--     변경일: 2026-05-21
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "requirement_files" (
    "id"             TEXT        NOT NULL,
    "requirementId"  TEXT        NOT NULL,
    "filename"       TEXT        NOT NULL,
    "originalName"   TEXT        NOT NULL,
    "mimetype"       TEXT        NOT NULL,
    "size"           INTEGER     NOT NULL,
    "uploadedById"   TEXT        NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_files_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "requirement_files"
    ADD CONSTRAINT "requirement_files_requirementId_fkey"
        FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "requirement_files"
    ADD CONSTRAINT "requirement_files_uploadedById_fkey"
        FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- [6] requirement_comments 테이블 신규 생성
--     요구사항 댓글/코멘트 기능
--     변경일: 2026-05-21
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "requirement_comments" (
    "id"             TEXT        NOT NULL,
    "requirementId"  TEXT        NOT NULL,
    "content"        TEXT        NOT NULL,
    "createdById"    TEXT        NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_comments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "requirement_comments"
    ADD CONSTRAINT "requirement_comments_requirementId_fkey"
        FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "requirement_comments"
    ADD CONSTRAINT "requirement_comments_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- [7] ReviewStatus Enum 신규 생성 + requirements 테이블 컬럼 추가
--     요구사항 검토 상태 관리 기능 (main 브랜치 추가 기능)
--     변경일: 2026-05-21
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE "ReviewStatus" AS ENUM (
        'PENDING',      -- 검토 대기
        'REVIEWING',    -- 검토 중
        'ACCEPTED',     -- 수락
        'NEGOTIATING',  -- 협의 중
        'DEFERRED',     -- 보류
        'REJECTED'      -- 반려
    );
EXCEPTION
    WHEN duplicate_object THEN NULL; -- 이미 존재하면 무시
END $$;

-- requirements 테이블에 검토 상태 컬럼 추가
ALTER TABLE "requirements"
    ADD COLUMN IF NOT EXISTS "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING';

-- requirements 테이블에 검토 메모 컬럼 추가
ALTER TABLE "requirements"
    ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
