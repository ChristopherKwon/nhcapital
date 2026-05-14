-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('RELATED_TO', 'PARENT_OF', 'CHILD_OF', 'DUPLICATES', 'BLOCKED_BY');

-- CreateTable
CREATE TABLE "ticket_relations" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "relatedTicketId" TEXT NOT NULL,
    "relationType" "RelationType" NOT NULL DEFAULT 'RELATED_TO',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_relations_ticketId_relatedTicketId_key" ON "ticket_relations"("ticketId", "relatedTicketId");

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_relatedTicketId_fkey" FOREIGN KEY ("relatedTicketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_relations" ADD CONSTRAINT "ticket_relations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
