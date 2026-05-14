-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('SCREEN', 'INTERFACE', 'MODULE', 'QUERY');

-- CreateEnum
CREATE TYPE "ImpactLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateTable
CREATE TABLE "program_impacts" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "programType" "ProgramType" NOT NULL,
    "programName" TEXT NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "impactLevel" "ImpactLevel" NOT NULL DEFAULT 'MEDIUM',
    "impactScope" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_impacts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "program_impacts" ADD CONSTRAINT "program_impacts_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_impacts" ADD CONSTRAINT "program_impacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
