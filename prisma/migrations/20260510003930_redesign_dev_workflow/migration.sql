-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StageActionType" ADD VALUE 'COLLABORATE';
ALTER TYPE "StageActionType" ADD VALUE 'PARALLEL_APPROVE';
ALTER TYPE "StageActionType" ADD VALUE 'COMBINED_WORK';

-- CreateTable
CREATE TABLE "requirement_annotations" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "shapes" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_consensus" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "requesterAgreed" BOOLEAN NOT NULL DEFAULT false,
    "itBaAgreed" BOOLEAN NOT NULL DEFAULT false,
    "requesterAgreedAt" TIMESTAMP(3),
    "itBaAgreedAt" TIMESTAMP(3),
    "resetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collaboration_consensus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parallel_approvals" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "action" "ApprovalAction",
    "comment" TEXT,
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parallel_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combined_work_logs" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "devCompletedAt" TIMESTAMP(3),
    "testCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combined_work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combined_work_attachments" (
    "id" TEXT NOT NULL,
    "workLogId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimetype" TEXT,
    "size" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "combined_work_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collaboration_consensus_ticketId_key" ON "collaboration_consensus"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "parallel_approvals_ticketId_approverId_key" ON "parallel_approvals"("ticketId", "approverId");

-- CreateIndex
CREATE UNIQUE INDEX "combined_work_logs_ticketId_key" ON "combined_work_logs"("ticketId");

-- AddForeignKey
ALTER TABLE "requirement_annotations" ADD CONSTRAINT "requirement_annotations_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_annotations" ADD CONSTRAINT "requirement_annotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_consensus" ADD CONSTRAINT "collaboration_consensus_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parallel_approvals" ADD CONSTRAINT "parallel_approvals_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parallel_approvals" ADD CONSTRAINT "parallel_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combined_work_logs" ADD CONSTRAINT "combined_work_logs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combined_work_attachments" ADD CONSTRAINT "combined_work_attachments_workLogId_fkey" FOREIGN KEY ("workLogId") REFERENCES "combined_work_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combined_work_attachments" ADD CONSTRAINT "combined_work_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
