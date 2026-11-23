import "server-only";

import type { Department } from "@/types";
import { prisma } from "@/lib/db/client";
import { createCachedLoader, getDataSourceMode } from "./reader";

/**
 * Filter options for reading departments from PostgreSQL.
 */
export interface DepartmentFilterOptions {
  organizationId?: string;
  outletId?: string;
  includeInactive?: boolean;
}

const loadDepartmentsMock = createCachedLoader<Department[]>("departments.json");

/**
 * Loads departments from PostgreSQL (when DATA_SOURCE=database) or from mock data (default).
 *
 * Business Rules:
 * - In database mode, reads from PostgreSQL `departments` table via Prisma.
 * - Maps `departmentCode` (or `id`) to `department_id`, `name`, and `benchmarkHeadcount` to `benchmark_headcount`.
 * - Respects active/inactive convention (`isActive: true` by default unless `includeInactive: true`).
 * - Supports organizationId and outletId filtering.
 * - If database access fails, throws an explicit error (never silent mock fallback).
 */
export async function getDepartments(options?: DepartmentFilterOptions): Promise<Department[]> {
  const mode = getDataSourceMode();

  if (mode === "mock") {
    return loadDepartmentsMock();
  }

  // Database mode: Read from PostgreSQL via Prisma
  try {
    const whereClause: {
      outlet?: {
        organizationId?: string;
      };
      outletId?: string;
      isActive?: boolean;
    } = {};

    if (options?.organizationId) {
      whereClause.outlet = { organizationId: options.organizationId };
    }

    if (options?.outletId && options.outletId !== "all") {
      whereClause.outletId = options.outletId;
    }

    if (!options?.includeInactive) {
      whereClause.isActive = true;
    }

    const departments = await prisma.department.findMany({
      where: whereClause,
      orderBy: { departmentCode: "asc" },
    });

    // Deduplicate by department code across multi-outlet database fixtures
    // so consuming components (and React keys) receive a distinct list.
    const seenCodes = new Set<string>();
    const uniqueDepartments: Department[] = [];

    for (const d of departments) {
      const code = d.departmentCode || d.id;
      if (!seenCodes.has(code)) {
        seenCodes.add(code);
        uniqueDepartments.push({
          department_id: code,
          name: d.name,
          benchmark_headcount: d.benchmarkHeadcount,
        });
      }
    }

    return uniqueDepartments;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[DATA_SOURCE=database] Failed to load departments from PostgreSQL: ${message}`);
  }
}