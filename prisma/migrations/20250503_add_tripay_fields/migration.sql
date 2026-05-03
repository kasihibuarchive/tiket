-- AlterTable: Add Tripay payment fields to Transaction
ALTER TABLE "Transaction" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "paymentUrl" TEXT;
