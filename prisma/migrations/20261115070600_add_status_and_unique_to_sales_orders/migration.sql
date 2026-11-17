-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'Success';

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_outlet_id_petpooja_order_id_key" ON "sales_orders"("outlet_id", "petpooja_order_id");
