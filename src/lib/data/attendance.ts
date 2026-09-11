import "server-only";

import type { Attendance } from "@/types";
import { createCachedLoader } from "./reader";

const loadAttendance = createCachedLoader<Attendance[]>("attendance.json");

export async function getAttendance(): Promise<Attendance[]> {
  return loadAttendance();
}
