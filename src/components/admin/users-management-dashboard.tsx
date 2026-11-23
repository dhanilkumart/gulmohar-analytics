"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { Plus, Edit2, KeyRound, CheckCircle2, XCircle, Shield, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionHeader, StatusBadge } from "@/components/dashboard/ui-kit";
import { DataTable, type Column } from "@/components/dashboard/data-table";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import {
  UserFormDialog,
  PasswordResetDialog,
  type UserManagementItem,
} from "./user-form-dialog";

export function UsersManagementDashboard() {
  const [users, setUsers] = useState<UserManagementItem[]>([]);
  const [availableOutlets, setAvailableOutlets] = useState<
    { id: string; code: string; name: string; city: string }[]
  >([]);
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "manager">("admin");
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserManagementItem | null>(null);

  const [passwordResetOpen, setPasswordResetOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<UserManagementItem | null>(null);

  const [statusTargetUser, setStatusTargetUser] = useState<UserManagementItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.users)) {
          setUsers(json.users);
          setAvailableOutlets(json.availableOutlets || []);
          if (json.currentUserRole) {
            setCurrentUserRole(json.currentUserRole);
          }
        }
      } else {
        toast.error("Failed to load user list");
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
      toast.error("Network error loading users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/users");
        if (res.ok && !ignore) {
          const json = await res.json();
          if (json.success && Array.isArray(json.users)) {
            setUsers(json.users);
            setAvailableOutlets(json.availableOutlets || []);
            if (json.currentUserRole) {
              setCurrentUserRole(json.currentUserRole);
            }
          }
        } else if (!ignore) {
          toast.error("Failed to load user list");
        }
      } catch (err) {
        if (!ignore) {
          console.error("Failed to fetch users:", err);
          toast.error("Network error loading users");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleToggleStatus = (target: UserManagementItem) => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/users/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: target.id,
            isActive: !target.isActive,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to update user status");
        }

        toast.success(data.message || "User status updated");
        setStatusTargetUser(null);
        fetchUsers();
      } catch (err: unknown) {
        const error = err as Error;
        toast.error(error.message || "An error occurred");
      }
    });
  };

  // Actions authorized check
  const canManageUser = (target: UserManagementItem) => {
    if (currentUserRole === "admin") return true;
    if (currentUserRole === "manager") {
      // Manager can only manage Operators
      return target.role === "OPERATOR";
    }
    return false;
  };

  const columns: Column<UserManagementItem>[] = [
    {
      key: "name",
      header: "User Details",
      cell: (r) => (
        <div>
          <span className="font-semibold text-foreground">{r.displayName}</span>
          <div className="text-xs text-muted-foreground font-mono">{r.username}</div>
        </div>
      ),
      sortValue: (r) => r.displayName,
    },
    {
      key: "role",
      header: "Role",
      cell: (r) => {
        let badgeTone: "positive" | "warning" | "neutral" = "neutral";
        if (r.role === "ADMIN") badgeTone = "warning";
        if (r.role === "MANAGER") badgeTone = "positive";

        return (
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-muted-foreground" />
            <StatusBadge tone={badgeTone}>{r.role}</StatusBadge>
          </div>
        );
      },
      sortValue: (r) => r.role,
    },
    {
      key: "outlets",
      header: "Assigned Outlets",
      cell: (r) => {
        if (r.role === "ADMIN" || r.role === "MANAGER") {
          return (
            <span className="text-xs text-muted-foreground italic">
              Organization-wide (All Outlets)
            </span>
          );
        }

        if (r.outletAssignments.length === 0) {
          return <span className="text-xs text-amber-600 font-medium">None assigned</span>;
        }

        return (
          <div className="flex flex-wrap gap-1 items-center">
            <Store className="h-3 w-3 text-muted-foreground mr-0.5" />
            {r.outletAssignments.map((oa) => (
              <span
                key={oa.outletId}
                className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded bg-muted/60 text-foreground"
              >
                {oa.code}
                {oa.isDefault && (
                  <span className="ml-1 text-[9px] text-primary font-bold">(Default)</span>
                )}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={r.isActive ? "positive" : "neutral"}>
          {r.isActive ? "Active" : "Inactive"}
        </StatusBadge>
      ),
      sortValue: (r) => (r.isActive ? 1 : 0),
    },
    {
      key: "created",
      header: "Created Date",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {new Date(r.createdAt).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
      sortValue: (r) => r.createdAt,
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => {
        const allowed = canManageUser(r);
        if (!allowed) {
          return <span className="text-xs text-muted-foreground italic">View only</span>;
        }

        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Edit User"
              onClick={() => {
                setEditingUser(r);
                setFormOpen(true);
              }}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Reset Password"
              onClick={() => {
                setResetTargetUser(r);
                setPasswordResetOpen(true);
              }}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={`h-8 w-8 p-0 ${
                r.isActive ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"
              }`}
              title={r.isActive ? "Deactivate User" : "Activate User"}
              onClick={() => setStatusTargetUser(r)}
            >
              {r.isActive ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="space-y-6">
      <div className="surface-card p-5">
        <SectionHeader
          title="User Accounts Directory"
          description="Manage authenticated staff members, roles, permissions, and floor outlet access."
          action={
            <Button
              onClick={() => {
                setEditingUser(null);
                setFormOpen(true);
              }}
              className="rounded-xl"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add User
            </Button>
          }
        />

        <div className="mt-4">
          <DataTable
            rows={users}
            columns={columns}
            pageSize={10}
            rowKey={(row) => row.id}
            searchKeys={(row) =>
              `${row.displayName} ${row.username} ${row.role} ${row.outletAssignments
                .map((o) => `${o.code} ${o.name}`)
                .join(" ")}`
            }
            filters={[
              {
                key: "role",
                label: "Role",
                options: ["ADMIN", "MANAGER", "OPERATOR"],
                match: (row, value) => row.role === value,
              },
              {
                key: "status",
                label: "Status",
                options: ["Active", "Inactive"],
                match: (row, value) => (value === "Active" ? row.isActive : !row.isActive),
              },
            ]}
            emptyMessage={
              loading
                ? "Loading user directory from database..."
                : "No accounts found matching your filter criteria."
            }
          />
        </div>
      </div>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        currentUserRole={currentUserRole}
        availableOutlets={availableOutlets}
        editingUser={editingUser}
        onSuccess={fetchUsers}
      />

      <PasswordResetDialog
        open={passwordResetOpen}
        onOpenChange={setPasswordResetOpen}
        user={resetTargetUser}
        onSuccess={fetchUsers}
      />

      <ConfirmDialog
        open={Boolean(statusTargetUser)}
        onOpenChange={(open) => !open && setStatusTargetUser(null)}
        title={statusTargetUser?.isActive ? "Deactivate User Account" : "Activate User Account"}
        description={
          statusTargetUser?.isActive
            ? `Are you sure you want to deactivate ${statusTargetUser?.displayName} (${statusTargetUser?.username})? They will be signed out immediately and unable to log in.`
            : `Are you sure you want to activate ${statusTargetUser?.displayName} (${statusTargetUser?.username})? They will regain access to their assigned portal.`
        }
        confirmLabel={
          isPending
            ? "Updating..."
            : statusTargetUser?.isActive
            ? "Deactivate Account"
            : "Activate Account"
        }
        onConfirm={() => statusTargetUser && handleToggleStatus(statusTargetUser)}
      />
    </section>
  );
}
