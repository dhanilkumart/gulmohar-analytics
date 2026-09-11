/**
 * Structure of mock_data/attendance.json ("biometric-like" attendance,
 * per data-dictionary.md — this is a demo model, not a real biometric
 * vendor export).
 *
 * Observed `status` values: "Present" | "Absent" | "Leave".
 * Observed `shift` values: "Morning" | "General" | "Evening" | null
 * (`shift` is null exactly when `status` is "Absent" or "Leave").
 * `working_hours` is 0 when `status` is not "Present".
 */
export interface Attendance {
  attendance_id: string;
  date: string;
  employee_id: string;
  status: string;
  shift: string | null;
  working_hours: number;
}
