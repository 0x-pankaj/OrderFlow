-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderKey" TEXT NOT NULL,
    "maker" TEXT NOT NULL,
    "inputMint" TEXT NOT NULL,
    "outputMint" TEXT NOT NULL,
    "makingAmount" BIGINT NOT NULL,
    "takingAmount" BIGINT NOT NULL,
    "oriMakingAmount" BIGINT NOT NULL,
    "oriTakingAmount" BIGINT NOT NULL,
    "expiredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "uniqueId" BIGINT NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderKey_key" ON "Order"("orderKey");

-- CreateIndex
CREATE INDEX "Order_maker_idx" ON "Order"("maker");

-- CreateIndex
CREATE INDEX "Order_inputMint_idx" ON "Order"("inputMint");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");
