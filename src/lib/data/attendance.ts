import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { Attendance } from "@/types";

/**
 * attendance.json loader:
 * In Phase 1, daily biometric employee swipe records do not have a dedicated PostgreSQL table
 * (only the employees master directory table exists).
 *
 * Per business rules:
 * - Keep `getAttendance()` on its verified mock baseline path regardless of DATA_SOURCE.
 * - Do not invent daily attendance swipes or clock-in records.
 * - Biometric integration and attendance logging are explicitly deferred to Phase 2.
 */
let cachedAttendance: Attendance[] | undefined;

function loadAttendanceData(): Attendance[] {
  if (!cachedAttendance) {
    const filePath = path.join(process.cwd(), "mock_data", "attendance.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    cachedAttendance = JSON.parse(raw) as Attendance[];
  }
  return cachedAttendance;
}

export async function getAttendance(): Promise<Attendance[]> {
  return loadAttendanceData();
}