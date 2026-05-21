# nhcapital branch_psj

`ChristopherKwon/nhcapital`의 `main` 브랜치를 기준으로 만든 `branch_psj` 작업 브랜치입니다.

원격 저장소에는 별도 `README`가 없어서, 이 문서는 현재 소스와 `prisma/schema.prisma`, `prisma/migrations` 기준으로 정리했습니다.

## 실행

1. `npm install`
2. `.env.example`을 참고해 `.env` 작성
3. PostgreSQL에 `nhcapital_branch_psj` 데이터베이스 생성
4. `npx prisma migrate deploy`
5. `node src/utils/seed.js`
6. `npm start`

기본 접속 주소는 `http://localhost:3201` 입니다.

## 기본 환경 변수

- `DATABASE_URL`: PostgreSQL 연결 문자열
- `JWT_SECRET`: 로그인 토큰 서명 키
- `JWT_EXPIRES_IN`: JWT 만료 시간
- `PORT`: 서버 포트
- `UPLOAD_PATH`: 업로드 파일 저장 경로
- `MAX_FILE_SIZE`: 업로드 최대 크기(byte)
- `ANTHROPIC_API_KEY`: AI 기능 사용 시 필요, 없으면 일부 기능은 기본값으로 동작

## DB 설계 기준

핵심 모델은 아래 Prisma 스키마를 기준으로 구성됩니다.

- `departments`
- `users`
- `ticket_types`
- `workflow_stages`
- `tickets`
- `ticket_stage_histories`
- `ticket_consensus`
- `ticket_comments`
- `ticket_attachments`
- `ticket_relations`
- `notifications`
- `test_cases`
- `test_results`
- `test_result_attachments`
- `defects`
- `requirements`
- `requirement_histories`
- `requirement_annotations`
- `requirement_files`
- `requirement_comments`
- `deployment_plans`
- `deploy_checklist_items`
- `deployment_results`
- `program_impacts`
- `ticket_developers`
- `ticket_watchers`
- `parallel_approvals`
- `combined_work_logs`
- `combined_work_attachments`
- `audit_logs`

## 시드 계정

- `ADMIN001 / Admin1234!`
- `MGR001 / Manager1234!`
- `APR001 / Approver1234!`
- `DEV001 / Dev1234!`
- `USR001 / User1234!`
