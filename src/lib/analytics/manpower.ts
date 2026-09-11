import "server-only";

import { getDepartments, getEmployees } from "@/lib/data";

export interface DepartmentManpower {
  departmentId: string;
  name: string;
  benchmarkHeadcount: number;
  actualHeadcount: number;
  /** actualHeadcount - benchmarkHeadcount (positive = overstaffed vs. benchmark). */
  variance: number;
  monthlyLaborCost: number;
}

/**
 * Actual headcount (from employees.json, active employees) vs. each
 * department's benchmark_headcount, plus a monthly labor cost roll-up.
 *
 * Note: employees.json only has `monthly_salary` — there is no hourly
 * rate or shift-based pay in the mock data, so labor cost estimates here
 * are monthly figures, not daily/hourly ones. Deriving a daily equivalent
 * would require an assumed working-days-per-month divisor, which is not
 * specified in business-rules.md.
 */
export async function getDepartmentManpower(): Promise<DepartmentManpower[]> {
  const [departments, employees] = await Promise.all([getDepartments(), getEmployees()]);

  const activeEmployeesByDept = new Map<string, typeof employees>();
  for (const employee of employees) {
    if (employee.employment_status !== "active") continue;
    const list = activeEmployeesByDept.get(employee.department_id) ?? [];
    list.push(employee);
    activeEmployeesByDept.set(employee.department_id, list);
  }

  return departments.map((dept) => {
    const deptEmployees = activeEmployeesByDept.get(dept.department_id) ?? [];
    const monthlyLaborCost = deptEmployees.reduce((sum, e) => sum + e.monthly_salary, 0);

    return {
      departmentId: dept.department_id,
      name: dept.name,
      benchmarkHeadcount: dept.benchmark_headcount,
      actualHeadcount: deptEmployees.length,
      variance: deptEmployees.length - dept.benchmark_headcount,
      monthlyLaborCost,
    };
  });
}

/** Total estimated monthly labor cost across all active employees. */
export async function getTotalMonthlyLaborCost(): Promise<number> {
  const employees = await getEmployees();
  return employees
    .filter((e) => e.employment_status === "active")
    .reduce((sum, e) => sum + e.monthly_salary, 0);
}
