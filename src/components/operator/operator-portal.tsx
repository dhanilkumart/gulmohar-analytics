"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Trash2, Utensils, CheckCircle, ShieldAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface OperatorPortalProps {
  user: {
    username: string;
    displayName: string;
    role: string;
  };
  outlet: {
    id: string;
    code: string;
    name: string;
    city: string;
  };
}

interface PreparationItemOption {
  id: string;
  name: string;
  code: string;
  unit: string;
  departmentId?: string | null;
}

interface BreakageItemOption {
  id: string;
  name: string;
  code: string;
  category: string;
  replacementCost: number | null;
}

interface ReasonOption {
  id: string;
  code: string;
  label: string;
}

interface DepartmentOption {
  id: string;
  name: string;
  departmentCode: string;
}

export function OperatorPortal({ user, outlet }: OperatorPortalProps) {
  const router = useRouter();

  // Metadata dropdown state
  const [prepItems, setPrepItems] = useState<PreparationItemOption[]>([]);
  const [breakageItems, setBreakageItems] = useState<BreakageItemOption[]>([]);
  const [wastageReasons, setWastageReasons] = useState<ReasonOption[]>([]);
  const [breakageReasons, setBreakageReasons] = useState<ReasonOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  // Wastage Form State
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [wastageWasteQty, setWastageWasteQty] = useState("");
  const [wastageReason, setWastageReason] = useState("");
  const [wastageNotes, setWastageNotes] = useState("");
  const [isSubmittingWastage, setIsSubmittingWastage] = useState(false);

  // Breakage Form State
  const [breakageItem, setBreakageItem] = useState("");
  const [breakageDeptId, setBreakageDeptId] = useState("");
  const [breakageQty, setBreakageQty] = useState("1");
  const [breakageReason, setBreakageReason] = useState("");
  const [breakageNotes, setBreakageNotes] = useState("");
  const [isSubmittingBreakage, setIsSubmittingBreakage] = useState(false);

  // Recent Submissions State (Session Only)
  const [recentLogs, setRecentLogs] = useState<
    { type: "Wastage" | "Breakage"; title: string; qty: string; time: string }[]
  >([]);

  // Load operational metadata on mount
  useEffect(() => {
    fetch("/api/operator/meta")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success) {
          if (Array.isArray(data.preparationItems)) {
            setPrepItems(data.preparationItems);
            if (data.preparationItems.length > 0) {
              setSelectedItemId(data.preparationItems[0].id);
            }
          }
          if (Array.isArray(data.breakageItems)) {
            setBreakageItems(data.breakageItems);
            if (data.breakageItems.length > 0) {
              setBreakageItem(data.breakageItems[0].name);
            }
          }
          if (Array.isArray(data.wastageReasons)) {
            setWastageReasons(data.wastageReasons);
            if (data.wastageReasons.length > 0) {
              setWastageReason(data.wastageReasons[0].label);
            }
          }
          if (Array.isArray(data.breakageReasons)) {
            setBreakageReasons(data.breakageReasons);
            if (data.breakageReasons.length > 0) {
              setBreakageReason(data.breakageReasons[0].label);
            }
          }
          if (Array.isArray(data.departments)) {
            setDepartments(data.departments);
            if (data.departments.length > 0) {
              setBreakageDeptId(data.departments[0].id);
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  const selectedPrepItem = prepItems.find((p) => p.id === selectedItemId);
  const selectedBreakageItem = breakageItems.find(
    (b) => b.name.toLowerCase() === breakageItem.toLowerCase()
  );

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Logged out successfully");
    router.push("/login");
    router.refresh();
  };

  const handleWastageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || !wastageWasteQty) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (isSubmittingWastage) return;

    setIsSubmittingWastage(true);

    try {
      const res = await fetch("/api/operator/wastage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedItemId,
          wastedQuantity: parseFloat(wastageWasteQty),
          reason: wastageReason,
          notes: wastageNotes || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to log wastage record");
      }

      setRecentLogs((prev) => [
        {
          type: "Wastage",
          title: selectedPrepItem?.name || "Kitchen Item",
          qty: `${wastageWasteQty} ${selectedPrepItem?.unit || "units"}`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ]);

      toast.success(data.message || `Wastage record logged for ${selectedPrepItem?.name}`);
      setWastageWasteQty("");
      setWastageNotes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error logging wastage");
    } finally {
      setIsSubmittingWastage(false);
    }
  };

  const handleBreakageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!breakageItem || !breakageQty) {
      toast.error("Please fill in all required fields.");
      return;
    }

    if (isSubmittingBreakage) return;

    setIsSubmittingBreakage(true);

    try {
      const selectedDept = departments.find((d) => d.id === breakageDeptId);
      const res = await fetch("/api/operator/breakage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: breakageItem,
          departmentId: breakageDeptId || undefined,
          departmentName: selectedDept?.name || "Kitchen",
          brokenQuantity: parseInt(breakageQty, 10),
          reason: breakageReason,
          notes: breakageNotes || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to log breakage record");
      }

      setRecentLogs((prev) => [
        {
          type: "Breakage",
          title: data.record?.item || breakageItem,
          qty: `${breakageQty} unit(s)`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ]);

      toast.success(data.message || `Breakage record logged for ${breakageItem}`);
      setBreakageItem("");
      setBreakageQty("1");
      setBreakageNotes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error logging breakage");
    } finally {
      setIsSubmittingBreakage(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header Bar */}
        <header className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm border border-border md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-display font-bold text-sm">
              AG
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-bold">Ashirvad Gulmohar</h1>
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {outlet.code}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Floor Operations Portal • Logged in as:{" "}
                <span className="font-medium text-foreground">{user.displayName}</span> ({user.role})
              </p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={handleLogout} className="self-end md:self-auto gap-2">
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </Button>
        </header>

        {/* Operational Entry Forms */}
        <Tabs defaultValue="wastage" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 rounded-xl">
            <TabsTrigger value="wastage" className="gap-2 rounded-lg py-2.5">
              <Trash2 className="h-4 w-4" />
              <span>Log Food Wastage</span>
            </TabsTrigger>
            <TabsTrigger value="breakage" className="gap-2 rounded-lg py-2.5">
              <Utensils className="h-4 w-4" />
              <span>Log Tableware Breakage</span>
            </TabsTrigger>
          </TabsList>

          {/* Wastage Entry Tab */}
          <TabsContent value="wastage">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Kitchen Food Wastage Logging</CardTitle>
                <CardDescription className="text-xs">
                  Record daily spoiled, unsold, or over-prepared food portions. All submissions are saved to the database.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleWastageSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="item">Kitchen Preparation Item *</Label>
                      {prepItems.length > 0 ? (
                        <Select
                          value={selectedItemId}
                          onValueChange={setSelectedItemId}
                          disabled={isSubmittingWastage}
                        >
                          <SelectTrigger id="item">
                            <SelectValue placeholder="Select preparation item..." />
                          </SelectTrigger>
                          <SelectContent>
                            {prepItems.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name} ({item.code}) — {item.unit}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs text-muted-foreground pt-2">
                          No active preparation items found for your kitchen.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reason">Reason for Wastage</Label>
                      {wastageReasons.length > 0 ? (
                        <Select
                          value={wastageReason}
                          onValueChange={setWastageReason}
                          disabled={isSubmittingWastage}
                        >
                          <SelectTrigger id="reason">
                            <SelectValue placeholder="Select reason..." />
                          </SelectTrigger>
                          <SelectContent>
                            {wastageReasons.map((r) => (
                              <SelectItem key={r.id} value={r.label}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                          No wastage reasons configured by admin.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="wasteQty">
                      Wasted Quantity ({selectedPrepItem?.unit || "units"}) *
                    </Label>
                    <Input
                      id="wasteQty"
                      type="number"
                      min="0.01"
                      step="any"
                      placeholder={`e.g. 2.5 ${selectedPrepItem?.unit || "units"}`}
                      value={wastageWasteQty}
                      onChange={(e) => setWastageWasteQty(e.target.value)}
                      required
                      disabled={isSubmittingWastage}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Optional Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Additional details regarding the batch or spoilage reason..."
                      value={wastageNotes}
                      onChange={(e) => setWastageNotes(e.target.value)}
                      rows={2}
                      disabled={isSubmittingWastage}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isSubmittingWastage}>
                    {isSubmittingWastage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving to Database...
                      </>
                    ) : (
                      "Submit Wastage Record"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Breakage Entry Tab */}
          <TabsContent value="breakage">
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Tableware & Crockery Breakage Logging</CardTitle>
                <CardDescription className="text-xs">
                  Record broken plates, glasses, bowls, or cutlery. Submissions are saved to the database.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleBreakageSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="item">Breakage Item *</Label>
                      {breakageItems.length > 0 ? (
                        <Select
                          value={breakageItem}
                          onValueChange={setBreakageItem}
                          disabled={isSubmittingBreakage}
                        >
                          <SelectTrigger id="item">
                            <SelectValue placeholder="Select breakage item..." />
                          </SelectTrigger>
                          <SelectContent>
                            {breakageItems.map((item) => (
                              <SelectItem key={item.id} value={item.name}>
                                {item.name} ({item.code}) — {item.category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                          No active breakage items configured by admin.
                        </div>
                      )}
                      {selectedBreakageItem && selectedBreakageItem.replacementCost !== null && (
                        <p className="text-xs text-muted-foreground">
                          Standard Cost: <span className="font-medium text-foreground">₹{selectedBreakageItem.replacementCost}</span>
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="dept">Department *</Label>
                      {departments.length > 0 ? (
                        <Select
                          value={breakageDeptId}
                          onValueChange={setBreakageDeptId}
                          disabled={isSubmittingBreakage}
                        >
                          <SelectTrigger id="dept">
                            <SelectValue placeholder="Select Department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name} ({dept.departmentCode})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="dept"
                          value="Kitchen"
                          disabled
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="breakQty">Broken Quantity *</Label>
                      <Input
                        id="breakQty"
                        type="number"
                        min="1"
                        step="1"
                        value={breakageQty}
                        onChange={(e) => setBreakageQty(e.target.value)}
                        required
                        disabled={isSubmittingBreakage}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="breakReason">Reason</Label>
                      {breakageReasons.length > 0 ? (
                        <Select
                          value={breakageReason}
                          onValueChange={setBreakageReason}
                          disabled={isSubmittingBreakage}
                        >
                          <SelectTrigger id="breakReason">
                            <SelectValue placeholder="Select reason..." />
                          </SelectTrigger>
                          <SelectContent>
                            {breakageReasons.map((r) => (
                              <SelectItem key={r.id} value={r.label}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="breakReason"
                          placeholder="e.g. Handling damage"
                          value={breakageReason}
                          onChange={(e) => setBreakageReason(e.target.value)}
                          disabled={isSubmittingBreakage}
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="breakNotes">Optional Notes</Label>
                    <Textarea
                      id="breakNotes"
                      placeholder="Additional details regarding the incident..."
                      value={breakageNotes}
                      onChange={(e) => setBreakageNotes(e.target.value)}
                      rows={2}
                      disabled={isSubmittingBreakage}
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={isSubmittingBreakage}>
                    {isSubmittingBreakage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving to Database...
                      </>
                    ) : (
                      "Submit Breakage Record"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Recent Shift Submissions (Append-Only Audit) */}
        <Card className="border-border shadow-sm">
          <CardHeader className="py-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle className="h-4 w-4 text-primary" />
              Recent Shift Submissions
            </CardTitle>
            <CardDescription className="text-xs">
              Records logged during your current session. Operator role cannot edit or delete submitted entries.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {recentLogs.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No entries submitted yet during this shift.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {recentLogs.map((log, index) => (
                  <div key={index} className="flex items-center justify-between p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`rounded-md px-2 py-0.5 font-medium ${
                          log.type === "Wastage"
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-blue-500/10 text-blue-600"
                        }`}
                      >
                        {log.type}
                      </span>
                      <span className="font-semibold text-foreground">{log.title}</span>
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{log.qty}</span>
                      <span>{log.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security Notice */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>All operational loss logs are cryptographically timestamped and tied to account: {user.username}</span>
        </div>
      </div>
    </div>
  );
}
