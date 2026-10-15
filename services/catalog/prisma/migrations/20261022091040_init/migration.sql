-- CreateTable
CREATE TABLE "HealthCheck" (
    "id" SERIAL NOT NULL,
    "note" TEXT NOT NULL DEFAULT 'ok',

    CONSTRAINT "HealthCheck_pkey" PRIMARY KEY ("id")
);
