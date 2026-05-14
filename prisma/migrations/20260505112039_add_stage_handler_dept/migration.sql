-- AlterTable
ALTER TABLE "workflow_stages" ADD COLUMN     "handlerDeptId" TEXT;

-- AddForeignKey
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_handlerDeptId_fkey" FOREIGN KEY ("handlerDeptId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
