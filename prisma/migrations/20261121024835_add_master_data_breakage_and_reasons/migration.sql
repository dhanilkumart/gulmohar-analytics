-- CreateTable
CREATE TABLE "breakage_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Tableware',
    "replacement_cost" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "breakage_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wastage_reasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wastage_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breakage_reasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "breakage_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "breakage_items_organization_id_idx" ON "breakage_items"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "breakage_items_organization_id_code_key" ON "breakage_items"("organization_id", "code");

-- CreateIndex
CREATE INDEX "wastage_reasons_organization_id_idx" ON "wastage_reasons"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "wastage_reasons_organization_id_code_key" ON "wastage_reasons"("organization_id", "code");

-- CreateIndex
CREATE INDEX "breakage_reasons_organization_id_idx" ON "breakage_reasons"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "breakage_reasons_organization_id_code_key" ON "breakage_reasons"("organization_id", "code");

-- AddForeignKey
ALTER TABLE "breakage_items" ADD CONSTRAINT "breakage_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_reasons" ADD CONSTRAINT "wastage_reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breakage_reasons" ADD CONSTRAINT "breakage_reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
