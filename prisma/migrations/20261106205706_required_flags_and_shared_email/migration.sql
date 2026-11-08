/*
  Warnings:

  - Made the column `deleted` on table `clients` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `clients` required. This step will fail if there are existing NULL values in that column.
  - Made the column `deleted` on table `invoices` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `invoices` required. This step will fail if there are existing NULL values in that column.
  - Made the column `canceled` on table `invoices` required. This step will fail if there are existing NULL values in that column.
  - Made the column `deleted` on table `services` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `services` required. This step will fail if there are existing NULL values in that column.
  - Made the column `canceled` on table `services` required. This step will fail if there are existing NULL values in that column.
  - Made the column `deleted` on table `tenants` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `tenants` required. This step will fail if there are existing NULL values in that column.
  - Made the column `deleted` on table `transactions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `transactions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `deleted` on table `users` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "deleted" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "invoices" ALTER COLUMN "deleted" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL,
ALTER COLUMN "canceled" SET NOT NULL;

-- AlterTable
ALTER TABLE "services" ALTER COLUMN "deleted" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL,
ALTER COLUMN "canceled" SET NOT NULL;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "deleted" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "deleted" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "deleted" SET NOT NULL,
ALTER COLUMN "updated_at" SET NOT NULL;
