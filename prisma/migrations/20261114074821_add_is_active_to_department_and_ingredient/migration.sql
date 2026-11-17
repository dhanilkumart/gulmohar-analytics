-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;
