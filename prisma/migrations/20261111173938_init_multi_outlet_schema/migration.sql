-- CreateEnum
CREATE TYPE "AppRole" AS ENUM ('admin', 'manager', 'operator');

-- CreateEnum
CREATE TYPE "PreparationType" AS ENUM ('batch', 'fresh_daily');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "petpooja_rest_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AppRole" NOT NULL,
    "display_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_outlet_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "outlet_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_outlet_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "department_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "benchmark_headcount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "employee_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "monthly_salary" DECIMAL(12,2) NOT NULL,
    "employment_status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "category_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "product_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_selling_price" DECIMAL(10,2) NOT NULL,
    "food_cost" DECIMAL(10,2),
    "unit" TEXT NOT NULL DEFAULT 'portion',
    "preparation_type" "PreparationType" NOT NULL DEFAULT 'batch',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "ingredient_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "default_cost" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "ingredient_id" UUID NOT NULL,
    "quantity_per_unit" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_product_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price_override" DECIMAL(10,2),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "petpooja_item_id" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "outlet_product_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wastage_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "prepared_quantity" DECIMAL(10,3) NOT NULL,
    "wasted_quantity" DECIMAL(10,3) NOT NULL,
    "unit_food_cost" DECIMAL(12,2),
    "estimated_cost" DECIMAL(12,2),
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wastage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breakage_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "item" TEXT NOT NULL,
    "broken_qty" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "breakage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "petpooja_order_id" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "ordered_at" TIMESTAMPTZ NOT NULL,
    "order_type" TEXT NOT NULL,
    "core_total" DECIMAL(12,2),
    "tax_total" DECIMAL(12,2),
    "discount_total" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2),
    "financial_status" TEXT NOT NULL DEFAULT 'pending',
    "matching_status" TEXT NOT NULL DEFAULT 'unmatched',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sales_order_id" UUID NOT NULL,
    "product_id" UUID,
    "item_name" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "item_tax" DECIMAL(10,2),
    "item_discount" DECIMAL(10,2),

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_code_key" ON "outlets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "outlets_petpooja_rest_id_key" ON "outlets"("petpooja_rest_id");

-- CreateIndex
CREATE INDEX "outlets_organization_id_idx" ON "outlets"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_username_key" ON "user_accounts"("username");

-- CreateIndex
CREATE INDEX "user_accounts_organization_id_idx" ON "user_accounts"("organization_id");

-- CreateIndex
CREATE INDEX "user_outlet_assignments_user_id_idx" ON "user_outlet_assignments"("user_id");

-- CreateIndex
CREATE INDEX "user_outlet_assignments_outlet_id_idx" ON "user_outlet_assignments"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_outlet_assignments_user_id_outlet_id_key" ON "user_outlet_assignments"("user_id", "outlet_id");

-- CreateIndex
CREATE INDEX "departments_outlet_id_idx" ON "departments"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_outlet_id_department_code_key" ON "departments"("outlet_id", "department_code");

-- CreateIndex
CREATE INDEX "employees_outlet_id_idx" ON "employees"("outlet_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_outlet_id_employee_code_key" ON "employees"("outlet_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_category_code_key" ON "categories"("organization_id", "category_code");

-- CreateIndex
CREATE INDEX "products_organization_id_category_id_idx" ON "products"("organization_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_product_code_key" ON "products"("organization_id", "product_code");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_organization_id_ingredient_code_key" ON "ingredients"("organization_id", "ingredient_code");

-- CreateIndex
CREATE INDEX "recipe_items_product_id_idx" ON "recipe_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_items_product_id_ingredient_id_key" ON "recipe_items"("product_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "outlet_product_settings_outlet_id_idx" ON "outlet_product_settings"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_product_settings_outlet_id_product_id_key" ON "outlet_product_settings"("outlet_id", "product_id");

-- CreateIndex
CREATE INDEX "wastage_records_outlet_id_date_idx" ON "wastage_records"("outlet_id", "date");

-- CreateIndex
CREATE INDEX "wastage_records_recorded_by_id_idx" ON "wastage_records"("recorded_by_id");

-- CreateIndex
CREATE INDEX "breakage_records_outlet_id_date_idx" ON "breakage_records"("outlet_id", "date");

-- CreateIndex
CREATE INDEX "breakage_records_department_id_idx" ON "breakage_records"("department_id");

-- CreateIndex
CREATE INDEX "breakage_records_recorded_by_id_idx" ON "breakage_records"("recorded_by_id");

-- CreateIndex
CREATE INDEX "sales_orders_outlet_id_order_date_idx" ON "sales_orders"("outlet_id", "order_date");

-- CreateIndex
CREATE INDEX "sales_order_items_sales_order_id_idx" ON "sales_order_items"("sales_order_id");

-- CreateIndex
CREATE INDEX "sales_order_items_product_id_idx" ON "sales_order_items"("product_id");

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlet_assignments" ADD CONSTRAINT "user_outlet_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_outlet_assignments" ADD CONSTRAINT "user_outlet_assignments_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_product_settings" ADD CONSTRAINT "outlet_product_settings_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_product_settings" ADD CONSTRAINT "outlet_product_settings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_records" ADD CONSTRAINT "wastage_records_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_records" ADD CONSTRAINT "wastage_records_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_records" ADD CONSTRAINT "wastage_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakage_records" ADD CONSTRAINT "breakage_records_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakage_records" ADD CONSTRAINT "breakage_records_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakage_records" ADD CONSTRAINT "breakage_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
