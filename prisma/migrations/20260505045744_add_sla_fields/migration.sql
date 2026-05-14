-- AlterTable
ALTER TABLE "ticket_stage_histories" ADD COLUMN     "elapsedMinutes" INTEGER,
ADD COLUMN     "slaExceededYn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "workflow_stages" ADD COLUMN     "slaTargetHours" INTEGER;
