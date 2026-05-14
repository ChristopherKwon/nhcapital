-- DropForeignKey
ALTER TABLE "ticket_consensus" DROP CONSTRAINT "ticket_consensus_departmentId_fkey";

-- AlterTable
ALTER TABLE "ticket_consensus" ALTER COLUMN "departmentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "itBaId" TEXT,
ADD COLUMN     "subCategory" TEXT,
ADD COLUMN     "targetSystem" TEXT;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_itBaId_fkey" FOREIGN KEY ("itBaId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_consensus" ADD CONSTRAINT "ticket_consensus_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
