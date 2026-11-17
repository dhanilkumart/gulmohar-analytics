"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface DepartmentItem {
  id: string;
  outletId: string;
  outletCode: string;
  outletName: string;
  departmentCode: string;
  name: string;
  benchmarkHeadcount: number;
  isActive: boolean;
  employeeCount: number;
  breakageCount: number;
}

interface OutletOption {
  id: string;
  code: string;
  name: string;
}

export function DepartmentsSection() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Form modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [formData, setFormData] = useState({
    outletId: "",
    departmentCode: "",
    name: "",
    benchmarkHeadcount: 0,
    isActive: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      const [outletsRes, deptsRes] = await Promise.all([
        fetch("/api/dashboard/outlets"),
        fetch("/api/admin/departments"),
      ]);
      if (outletsRes.ok) {
        const outJson = await outletsRes.json();
        if (Array.isArray(outJson.outlets)) setOutlets(outJson.outlets);
      }
      if (deptsRes.ok) {
        const deptJson = await deptsRes.json();
        if (deptJson.success && Array.isArray(deptJson.departments)) setDepartments(deptJson.departments);
      }
    } catch (err) {
      console.error(err);
      toast.error("Network error loading departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        const [outletsRes, deptsRes] = await Promise.all([
          fetch("/api/dashboard/outlets"),
          fetch("/api/admin/departments"),
        ]);
        if (!ignore) {
          if (outletsRes.ok) {
            const outJson = await outletsRes.json();
            if (Array.isArray(outJson.outlets)) setOutlets(outJson.outlets);
          }
          if (deptsRes.ok) {
            const deptJson = await deptsRes.json();
            if (deptJson.success && Array.isArray(deptJson.departments)) setDepartments(deptJson.departments);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error(err);
          toast.error("Network error loading departments");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenAdd = () => {
    setEditingDept(null);
    setFormData({
      outletId: outlets[0]?.id || "",
      departmentCode: "",
      name: "",
      benchmarkHeadcount: 0,
      isActive: true,
    });
    setFormOpen(true);
  };

  const handleOpenEdit = (dept: DepartmentItem) => {
    setEditingDept(dept);
    setFormData({
      outletId: dept.outletId,
      departmentCode: dept.departmentCode,
      name: dept.name,
      benchmarkHeadcount: dept.benchmarkHeadcount,
      isActive: dept.isActive,
    });
    setFormOpen(true);
  };

  const handleToggleStatus = async (dept: DepartmentItem) => {
    try {
      const res = await fetch("/api/admin/departments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: dept.id,
          isActive: !dept.isActive,
        }),
      });
      if (res.ok) {
        toast.success(`Department ${!dept.isActive ? "activated" : "deactivated"} successfully`);
        refreshData();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to update status");
      }
    } catch {
      toast.error("Failed to toggle department status");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingDept) {
        // Edit existing
        const res = await fetch("/api/admin/departments", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingDept.id,
            name: formData.name,
            benchmarkHeadcount: formData.benchmarkHeadcount,
            isActive: formData.isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update department");
        toast.success("Department updated successfully");
      } else {
        // Create new
        const res = await fetch("/api/admin/departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outletId: formData.outletId,
            departmentCode: formData.departmentCode,
            name: formData.name,
            benchmarkHeadcount: formData.benchmarkHeadcount,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create department");
        toast.success("Department created successfully");
      }
      setFormOpen(false);
      refreshData();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<DepartmentItem>[] = [
    {
      key: "outlet",
      header: "Outlet",
      sortValue: (r) => r.outletCode,
      cell: (r) => (
        <div>
          <span className="font-semibold">{r.outletCode}</span>
          <span className="text-muted-foreground ml-2 text-xs">({r.outletName})</span>
        </div>
      ),
    },
    {
      key: "code",
      header: "Code",
      sortValue: (r) => r.departmentCode,
      cell: (r) => <span className="font-mono text-xs">{r.departmentCode}</span>,
    },
    {
      key: "name",
      header: "Department Name",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      key: "headcount",
      header: "Benchmark Staff",
      align: "right",
      sortValue: (r) => r.benchmarkHeadcount,
      cell: (r) => <span>{r.benchmarkHeadcount}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => (r.isActive ? 1 : 0),
      cell: (r) => (
        <StatusBadge tone={r.isActive ? "positive" : "neutral"}>
          {r.isActive ? "Active" : "Inactive"}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleOpenEdit(r)}
            className="h-8 w-8 p-0"
            title="Edit Department"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleToggleStatus(r)}
            className={`h-8 w-8 p-0 ${r.isActive ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}`}
            title={r.isActive ? "Deactivate Department" : "Activate Department"}
          >
            {r.isActive ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="surface-card p-5">
      <SectionHeader
        title="Departments Directory"
        description="Outlet-specific operational departments and staffing benchmarks."
        action={
          <Button onClick={handleOpenAdd} className="rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> Add Department
          </Button>
        }
      />

      <div className="mt-4">
        <DataTable
          rows={departments}
          columns={columns}
          pageSize={8}
          rowKey={(row) => row.id}
          searchKeys={(row) => `${row.name} ${row.departmentCode} ${row.outletCode}`}
          filters={[
            {
              key: "outlet",
              label: "Outlet",
              options: [...new Set(departments.map((d) => d.outletCode))],
              match: (row, value) => row.outletCode === value,
            },
            {
              key: "status",
              label: "Status",
              options: ["Active", "Inactive"],
              match: (row, value) => (value === "Active" ? row.isActive : !row.isActive),
            },
          ]}
          emptyMessage={loading ? "Loading departments from database..." : "No departments found."}
        />
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDept ? "Edit Department" : "Add New Department"}</DialogTitle>
            <DialogDescription>
              {editingDept
                ? "Update operational details for this department."
                : "Create a new department for an assigned restaurant outlet."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {!editingDept && (
              <Field>
                <FieldLabel htmlFor="outletId">Outlet *</FieldLabel>
                <Select
                  value={formData.outletId}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, outletId: val }))}
                >
                  <SelectTrigger id="outletId">
                    <SelectValue placeholder="Select Outlet" />
                  </SelectTrigger>
                  <SelectContent>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.code} - {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {!editingDept && (
              <Field>
                <FieldLabel htmlFor="departmentCode">Department Code *</FieldLabel>
                <Input
                  id="departmentCode"
                  placeholder="e.g. D01, KITCHEN, BAR"
                  value={formData.departmentCode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, departmentCode: e.target.value }))}
                  required
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="name">Department Name *</FieldLabel>
              <Input
                id="name"
                placeholder="e.g. Main Kitchen, Dining Hall"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="benchmarkHeadcount">Benchmark Headcount</FieldLabel>
              <Input
                id="benchmarkHeadcount"
                type="number"
                min="0"
                value={formData.benchmarkHeadcount}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, benchmarkHeadcount: parseInt(e.target.value, 10) || 0 }))
                }
              />
            </Field>

            {editingDept && (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active Department
                </label>
              </div>
            )}

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {editingDept ? "Save Changes" : "Create Department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
