-- Magazin bot - PostgreSQL migration
-- CreateTable
CREATE TABLE "Expense" (
    "id"        SERIAL          NOT NULL,
    "product"   TEXT            NOT NULL,
    "quantity"  DOUBLE PRECISION NOT NULL,
    "price"     DOUBLE PRECISION NOT NULL,
    "note"      TEXT,
    "addedBy"   TEXT            NOT NULL,
    "addedById" BIGINT          NOT NULL,
    "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id"        BIGINT       NOT NULL,
    "username"  TEXT,
    "firstName" TEXT         NOT NULL,
    "lastName"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");
