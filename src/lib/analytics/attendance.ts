import "server-only";

import { getAttendance } from "@/lib/data";
import type { Attendance } from "@/types";
import {
  filterByDateRange,
  resolveTrendGranularity,
  enumeratePeriods,
  sumByPeriod,
  type DateRange,
  type TrendGranularity,
} from "./date-range";

export interface AttendanceSummary {
  presentCount: number;
  absentCount: number;
  leaveCount: number;
  /** presentCount / total marked days * 100, 0 when there are no records. */
  attendanceRate: number;
  totalWorkingHours: number;
  /** average working hours across "Present" records only. */
  averageWorkingHoursPerPresentDay: number;
}

export async function getAttendanceInRange(range: DateRange): Promise<Attendance[]> {
  const attendance = await getAttendance();
  return filterByDateRange(attendance, range, (row) => row.date);
}

export function getAttendanceSummary(attendance: Attendance[]): AttendanceSummary {
  const presentRecords = attendance.filter((row) => row.status === "Present");
  const absentCount = attendance.filter((row) => row.status === "Absent").length;
  const leaveCount = attendance.filter((row) => row.status === "Leave").length;
  const presentCount = presentRecords.length;
  const total = attendance.length;

  const totalWorkingHours = presentRecords.reduce((sum, row) => sum + row.working_hours, 0);

  return {
    presentCount,
    absentCount,
    leaveCount,
    attendanceRate: total > 0 ? (presentCount / total) * 100 : 0,
    totalWorkingHours,
    averageWorkingHoursPerPresentDay:
      presentCount > 0 ? totalWorkingHours / presentCount : 0,
  };
}

export interface AttendanceTrendPoint {
  period: string;
  presentCount: number;
  absentCount: number;
  leaveCount: number;
  /** presentCount / total records for the period * 100, 0 when the period has no records — consistent with `getAttendanceSummary`. */
  attendanceRate: number;
}

/** Present/absent/leave counts and attendance rate over time. */
export async function getAttendanceTrend(
  range: DateRange,
  granularity: TrendGranularity = resolveTrendGranularity(range)
): Promise<AttendanceTrendPoint[]> {
  const attendanceInRange = await getAttendanceInRange(range);

  const presentSums = sumByPeriod(
    attendanceInRange,
    granularity,
    (row) => row.date,
    (row) => (row.status === "Present" ? 1 : 0)
  );
  const absentSums = sumByPeriod(
    attendanceInRange,
    granularity,
    (row) => row.date,
    (row) => (row.status === "Absent" ? 1 : 0)
  );
  const leaveSums = sumByPeriod(
    attendanceInRange,
    granularity,
    (row) => row.date,
    (row) => (row.status === "Leave" ? 1 : 0)
  );
  const totalSums = sumByPeriod(
    attendanceInRange,
    granularity,
    (row) => row.date,
    () => 1
  );

  return enumeratePeriods(range, granularity).map((period) => {
    const presentCount = presentSums.get(period) ?? 0;
    const total = totalSums.get(period) ?? 0;
    return {
      period,
      presentCount,
      absentCount: absentSums.get(period) ?? 0,
      leaveCount: leaveSums.get(period) ?? 0,
      attendanceRate: total > 0 ? (presentCount / total) * 100 : 0,
    };
  });
}
