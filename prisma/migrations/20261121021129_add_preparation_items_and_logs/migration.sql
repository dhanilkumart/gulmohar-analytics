/*
  Warnings:

  - You are about to drop the column `prepared_quantity` on the `wastage_records` table. All the data in the column will be lost.
  - You are about to drop the column `product_id` on the `wastage_records` table. All the data in the column will be lost.
  - You are about to drop the column `unit_food_cost` on the `wastage_records` table. All the data in the column will be lost.
  - Added the required column `preparation_item_id` to the `wastage_records` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "wastage_records" DROP CONSTRAINT "wastage_records_product_id_fkey";

-- AlterTable
ALTER TABLE "wastage_records" DROP COLUMN "prepared_quantity",
DROP COLUMN "product_id",
DROP COLUMN "unit_food_cost",
ADD COLUMN     "department_id" UUID,
ADD COLUMN     "preparation_item_id" UUID NOT NULL,
ADD COLUMN     "unit_cost" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "preparation_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "department_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "standard_cost" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "preparation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preparation_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "preparation_item_id" UUID NOT NULL,
    "department_id" UUID,
    "recorded_by_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "preparation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preparation_items_organization_id_idx" ON "preparation_items"("organization_id");

-- CreateIndex
CREATE INDEX "preparation_items_department_id_idx" ON "preparation_items"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "preparation_items_organization_id_code_key" ON "preparation_items"("organization_id", "code");

-- CreateIndex
CREATE INDEX "preparation_logs_outlet_id_date_idx" ON "preparation_logs"("outlet_id", "date");

-- CreateIndex
CREATE INDEX "preparation_logs_preparation_item_id_idx" ON "preparation_logs"("preparation_item_id");

-- CreateIndex
CREATE INDEX "preparation_logs_recorded_by_id_idx" ON "preparation_logs"("recorded_by_id");

-- CreateIndex
CREATE INDEX "wastage_records_preparation_item_id_idx" ON "wastage_records"("preparation_item_id");

-- AddForeignKey
ALTER TABLE "preparation_items" ADD CONSTRAINT "preparation_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_items" ADD CONSTRAINT "preparation_items_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_logs" ADD CONSTRAINT "preparation_logs_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_logs" ADD CONSTRAINT "preparation_logs_preparation_item_id_fkey" FOREIGN KEY ("preparation_item_id") REFERENCES "preparation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_logs" ADD CONSTRAINT "preparation_logs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_logs" ADD CONSTRAINT "preparation_logs_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_records" ADD CONSTRAINT "wastage_records_preparation_item_id_fkey" FOREIGN KEY ("preparation_item_id") REFERENCES "preparation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_records" ADD CONSTRAINT "wastage_records_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
