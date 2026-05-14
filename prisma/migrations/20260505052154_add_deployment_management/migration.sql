-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('DRAFT', 'READY', 'DEPLOYED', 'FAILED', 'ROLLBACK', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeployResultStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'ROLLBACK');

-- CreateTable
CREATE TABLE "deployment_plans" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "deployTarget" TEXT NOT NULL,
    "deployType" TEXT NOT NULL,
    "plannedAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deployment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deploy_checklist_items" (
    "id" TEXT NOT NULL,
    "deploymentPlanId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemText" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "checkedById" TEXT,
    "checkedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "deploy_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_results" (
    "id" TEXT NOT NULL,
    "deploymentPlanId" TEXT NOT NULL,
    "status" "DeployResultStatus" NOT NULL,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deployedById" TEXT NOT NULL,
    "resultNote" TEXT,
    "rollbackNote" TEXT,

    CONSTRAINT "deployment_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deployment_plans_ticketId_key" ON "deployment_plans"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_results_deploymentPlanId_key" ON "deployment_results"("deploymentPlanId");

-- AddForeignKey
ALTER TABLE "deployment_plans" ADD CONSTRAINT "deployment_plans_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_plans" ADD CONSTRAINT "deployment_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_checklist_items" ADD CONSTRAINT "deploy_checklist_items_deploymentPlanId_fkey" FOREIGN KEY ("deploymentPlanId") REFERENCES "deployment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deploy_checklist_items" ADD CONSTRAINT "deploy_checklist_items_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_results" ADD CONSTRAINT "deployment_results_deploymentPlanId_fkey" FOREIGN KEY ("deploymentPlanId") REFERENCES "deployment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_results" ADD CONSTRAINT "deployment_results_deployedById_fkey" FOREIGN KEY ("deployedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
