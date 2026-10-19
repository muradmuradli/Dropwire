/*
  Warnings:

  - You are about to drop the `HealthCheck` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'RESERVED', 'OUT_OF_STOCK', 'PRODUCT_NOT_FOUND', 'RELEASED');

-- CreateEnum
CREATE TYPE "ReservationItemStatus" AS ENUM ('RESERVED', 'OUT_OF_STOCK', 'PRODUCT_NOT_FOUND');

-- DropTable
DROP TABLE "HealthCheck";

-- CreateTable
CREATE TABLE "Stock" (
    "productId" TEXT NOT NULL,
    "totalQuantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "orderId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "ReservationItem" (
    "id" SERIAL NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationItemStatus" NOT NULL,
    "availableQuantityAtCheck" INTEGER,

    CONSTRAINT "ReservationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReservationItem_orderId_idx" ON "ReservationItem"("orderId");

-- AddForeignKey
ALTER TABLE "ReservationItem" ADD CONSTRAINT "ReservationItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Reservation"("orderId") ON DELETE RESTRICT ON UPDATE CASCADE;
