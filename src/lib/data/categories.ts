import "server-only";

import type { Category } from "@/types";
import { prisma } from "@/lib/db/client";
import { createCachedLoader, getDataSourceMode } from "./reader";

/**
 * Filter options for reading categories from PostgreSQL.
 */
export interface CategoryFilterOptions {
  organizationId?: string;
}

const loadCategoriesMock = createCachedLoader<Category[]>("categories.json");

/**
 * Loads categories from PostgreSQL (when DATA_SOURCE=database) or from mock data (default).
 *
 * Business Rules:
 * - In database mode, reads from PostgreSQL `categories` table via Prisma.
 * - Maps `categoryCode` (or `id`) to `category_id` and category `name`.
 * - Respects organization boundary when specified.
 * - If database access fails, throws an explicit error (never silent mock fallback).
 */
export async function getCategories(options?: CategoryFilterOptions): Promise<Category[]> {
  const mode = getDataSourceMode();

  if (mode === "mock") {
    return loadCategoriesMock();
  }

  // Database mode: Read from PostgreSQL via Prisma
  try {
    const whereClause: {
      organizationId?: string;
    } = {};

    if (options?.organizationId) {
      whereClause.organizationId = options.organizationId;
    }

    const categories = await prisma.category.findMany({
      where: whereClause,
      orderBy: [{ displayOrder: "asc" }, { categoryCode: "asc" }],
    });

    return categories.map((cat) => ({
      category_id: cat.categoryCode || cat.id,
      name: cat.name,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[DATA_SOURCE=database] Failed to load categories from PostgreSQL: ${message}`);
  }
}