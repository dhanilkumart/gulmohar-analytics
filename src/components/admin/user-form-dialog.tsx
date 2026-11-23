"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface OutletOption {
  id: string;
  code: string;
  name: string;
  city: string;
}

export interface UserManagementItem {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "MANAGER" | "OPERATOR";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  outletAssignments: {
    outletId: string;
    code: string;
    name: string;
    city: string;
    isDefault: boolean;
  }[];
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserRole: "admin" | "manager";
  availableOutlets: OutletOption[];
  editingUser?: UserManagementItem | null;
  onSuccess: () => void;
}

export function UserFormDialog({
  open,
  onOpenChange,
  currentUserRole,
  availableOutlets,
  editingUser,
  onSuccess,
}: UserFormDialogProps) {
  if (!open) return null;

  return (
    <UserFormDialogInner
      open={open}
      onOpenChange={onOpenChange}
      currentUserRole={currentUserRole}
      availableOutlets={availableOutlets}
      editingUser={editingUser}
      onSuccess={onSuccess}
    />
  );
}

function UserFormDialogInner({
  open,
  onOpenChange,
  currentUserRole,
  availableOutlets,
  editingUser,
  onSuccess,
}: UserFormDialogProps) {
  const isEdit = Boolean(editingUser);
  const [isPending, startTransition] = useTransition();

  const [username, setUsername] = useState(() => editingUser?.username || "");
  const [displayName, setDisplayName] = useState(() => editingUser?.displayName || "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MANAGER" | "OPERATOR">(() => editingUser?.role || "OPERATOR");
  const [assignedOutletIds, setAssignedOutletIds] = useState<string[]>(() => {
    if (editingUser) return editingUser.outletAssignments.map((oa) => oa.outletId);
    return availableOutlets[0]?.id ? [availableOutlets[0].id] : [];
  });
  const [defaultOutletId, setDefaultOutletId] = useState<string>(() => {
    if (editingUser) {
      return (
        editingUser.outletAssignments.find((oa) => oa.isDefault)?.outletId ||
        editingUser.outletAssignments[0]?.outletId ||
        ""
      );
    }
    return availableOutlets[0]?.id || "";
  });

  const toggleOutlet = (outletId: string) => {
    setAssignedOutletIds((prev) => {
      const exists = prev.includes(outletId);
      let updated: string[];
      if (exists) {
        updated = prev.filter((id) => id !== outletId);
      } else {
        updated = [...prev, outletId];
      }

      if (updated.length > 0 && !updated.includes(defaultOutletId)) {
        setDefaultOutletId(updated[0]);
      } else if (updated.length === 0) {
        setDefaultOutletId("");
      }
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !displayName.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (!isEdit && (!password || password.length < 8)) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    if (role === "OPERATOR" && assignedOutletIds.length === 0) {
      toast.error("Operator accounts must be assigned to at least one outlet.");
      return;
    }

    startTransition(async () => {
      try {
        const url = "/api/admin/users";
        const method = isEdit ? "PUT" : "POST";
        const payload = isEdit
          ? {
              id: editingUser?.id,
              username: username.trim().toLowerCase(),
              displayName: displayName.trim(),
              role,
              assignedOutletIds,
              defaultOutletId,
            }
          : {
              username: username.trim().toLowerCase(),
              displayName: displayName.trim(),
              password,
              role,
              assignedOutletIds,
              defaultOutletId,
            };

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to save user account");
        }

        toast.success(isEdit ? "User account updated successfully" : "User created successfully");
        onOpenChange(false);
        onSuccess();
      } catch (err: unknown) {
        const error = err as Error;
        toast.error(error.message || "An unexpected error occurred");
      }
    });
  };

  // Role options allowed:
  // Admin can choose ADMIN, MANAGER, OPERATOR.
  // Manager can ONLY choose/edit OPERATOR.
  const allowedRoles =
    currentUserRole === "admin"
      ? [
          { value: "OPERATOR", label: "Operator (Floor / Kitchen staff)" },
          { value: "MANAGER", label: "Manager (CEO / Executive)" },
          { value: "ADMIN", label: "Administrator (Full System Access)" },
        ]
      : [{ value: "OPERATOR", label: "Operator (Floor / Kitchen staff)" }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User Account" : "Create New User Account"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update user profile details, role, and outlet access assignments."
              : "Provision a new authenticated user account in your organization."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="displayName">Display Name *</FieldLabel>
            <Input
              id="displayName"
              placeholder="e.g. Rahul Sharma"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="username">Username / Email *</FieldLabel>
            <Input
              id="username"
              placeholder="e.g. rahul.sharma or rahul@gulmohar.local"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>

          {!isEdit && (
            <Field>
              <FieldLabel htmlFor="password">Temporary Password * (min 8 chars)</FieldLabel>
              <Input
                id="password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="role">Role *</FieldLabel>
            <Select
              value={role}
              onValueChange={(val) => setRole(val as "ADMIN" | "MANAGER" | "OPERATOR")}
              disabled={currentUserRole === "manager"}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select user role" />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentUserRole === "manager" && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Managers are authorized to manage Operator accounts only.
              </p>
            )}
          </Field>

          {/* Outlet Assignments */}
          <div className="space-y-2 border-t pt-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">
                Assigned Outlets {role === "OPERATOR" ? "*" : "(Optional)"}
              </label>
              <span className="text-xs text-muted-foreground">
                {assignedOutletIds.length} selected
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {role === "OPERATOR"
                ? "Operators require at least one outlet to access their floor terminal."
                : "Managers and Admins operate organization-wide by default."}
            </p>

            <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto rounded-lg border p-2 bg-muted/20">
              {availableOutlets.map((outlet) => {
                const checked = assignedOutletIds.includes(outlet.id);
                return (
                  <label
                    key={outlet.id}
                    className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer hover:bg-muted/50 p-1.5 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOutlet(outlet.id)}
                      className="h-4 w-4 rounded"
                    />
                    <span className="font-medium">{outlet.name}</span>
                    <span className="text-muted-foreground">({outlet.code})</span>
                  </label>
                );
              })}
            </div>

            {assignedOutletIds.length > 1 && (
              <Field className="pt-2">
                <FieldLabel htmlFor="defaultOutlet">Default Outlet</FieldLabel>
                <Select value={defaultOutletId} onValueChange={setDefaultOutletId}>
                  <SelectTrigger id="defaultOutlet">
                    <SelectValue placeholder="Select default outlet" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOutlets
                      .filter((o) => assignedOutletIds.includes(o.id))
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name} ({o.code})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface PasswordResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserManagementItem | null;
  onSuccess: () => void;
}

export function PasswordResetDialog({
  open,
  onOpenChange,
  user,
  onSuccess,
}: PasswordResetDialogProps) {
  if (!open) return null;

  return (
    <PasswordResetDialogInner
      open={open}
      onOpenChange={onOpenChange}
      user={user}
      onSuccess={onSuccess}
    />
  );
}

function PasswordResetDialogInner({
  open,
  onOpenChange,
  user,
  onSuccess,
}: PasswordResetDialogProps) {
  const [newPassword, setNewPassword] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!newPassword || newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/users/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: user.id,
            newPassword,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to reset password");
        }

        toast.success(`Password reset successfully for ${user.username}`);
        onOpenChange(false);
        onSuccess();
      } catch (err: unknown) {
        const error = err as Error;
        toast.error(error.message || "Failed to reset password");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset User Password</DialogTitle>
          <DialogDescription>
            Enter a new password for <strong>{user?.displayName}</strong> ({user?.username}).
            All active sessions for this user will be revoked immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="newPassword">New Password * (min 8 chars)</FieldLabel>
            <Input
              id="newPassword"
              type="password"
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </Field>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Resetting..." : "Confirm Password Reset"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
