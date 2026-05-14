-- CreateTable
CREATE TABLE "test_result_attachments" (
    "id" TEXT NOT NULL,
    "testResultId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimetype" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_result_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "test_result_attachments" ADD CONSTRAINT "test_result_attachments_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "test_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
