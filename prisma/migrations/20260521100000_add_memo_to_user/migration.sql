-- Migration : 20260521100000_add_memo_to_user
-- Branch    : kpk
-- Date      : 2026-05-21
-- Author    : kpk
-- 변경 내용 : User 테이블에 memo(비고) 컬럼 추가

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "memo" TEXT;
