/**
 * Structure of mock_data/employees.json.
 *
 * `employment_status` only ever has the value "active" in the mock data,
 * but is left as `string` since other statuses (e.g. "inactive") are a
 * reasonable expectation for a real backend and no other values have been
 * observed to enumerate.
 */
export interface Employee {
  employee_id: string;
  name: string;
  department_id: string;
  role: string;
  monthly_salary: number;
  employment_status: string;
}
