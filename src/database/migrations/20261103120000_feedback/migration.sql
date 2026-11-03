CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'SPAM');

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "company" VARCHAR(255),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "message" VARCHAR(5000),
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "notes" VARCHAR(10000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Feedback_contact_check" CHECK (NULLIF(BTRIM("phone"), '') IS NOT NULL OR NULLIF(BTRIM("email"), '') IS NOT NULL)
);

CREATE INDEX "Feedback_status_createdAt_id_idx" ON "Feedback"("status", "createdAt", "id");
CREATE INDEX "Feedback_createdAt_id_idx" ON "Feedback"("createdAt", "id");
