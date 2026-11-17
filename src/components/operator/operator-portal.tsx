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

interface ProductOption {
  id: string;
  name: string;
  productCode: string;
  unit: string;
}

interface DepartmentOption {
  id: string;
  name: string;
  departmentCode: string;
}

export function OperatorPortal({ user, outlet }: OperatorPortalProps) {
  const router = useRouter();

  // Metadata dropdown state
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  // Wastage Form State
  const [wastageDish, setWastageDish] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [wastagePrepQty, setWastagePrepQty] = useState("");
  const [wastageWasteQty, setWastageWasteQty] = useState("");
  const [wastageReason, setWastageReason] = useState("End-of-day unsold");
  const [wastageNotes, setWastageNotes] = useState("");
  const [isSubmittingWastage, setIsSubmittingWastage] = useState(false);

  // Breakage Form State
  const [breakageItem, setBreakageItem] = useState("");
  const [breakageDeptId, setBreakageDeptId] = useState("");
  const [breakageQty, setBreakageQty] = useState("1");
  const [breakageReason, setBreakageReason] = useState("Handling damage");
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
          if (Array.isArray(data.products)) setProducts(data.products);
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

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    toast.success("Logged out successfully");
    router.push("/login");
    router.refresh();
  };

  const handleWastageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wastageDish || !wastagePrepQty || !wastageWasteQty) {
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
          dish: wastageDish,
          productId: selectedProductId || undefined,
          preparedQuantity: parseFloat(wastagePrepQty),
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
          title: data.record?.dish || wastageDish,
          qty: `${wastageWasteQty} portion(s)`,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
        ...prev,
      ]);

      toast.success(data.message || `Wastage record logged for ${wastageDish}`);
      setWastageDish("");
      setSelectedProductId("");
      setWastagePrepQty("");
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
                      <Label htmlFor="dish">Dish / Product Name *</Label>
                      {products.length > 0 ? (
                        <div className="space-y-2">
                          <Input
                            id="dish"
                            placeholder="e.g. Masala Dosa, Meals, Sambar"
                            value={wastageDish}
                            onChange={(e) => {
                              setWastageDish(e.target.value);
                              const matched = products.find(
                                (p) => p.name.toLowerCase() === e.target.value.toLowerCase()
                              );
                              setSelectedProductId(matched ? matched.id : "");
                            }}
                            required
                            disabled={isSubmittingWastage}
                          />
                        </div>
                      ) : (
                        <Input
                          id="dish"
                          placeholder="e.g. Masala Dosa, Meals, Sambar"
                          value={wastageDish}
                          onChange={(e) => setWastageDish(e.target.value)}
                          required
                          disabled={isSubmittingWastage}
                        />
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reason">Reason for Wastage</Label>
                      <Select
                        value={wastageReason}
                        onValueChange={setWastageReason}
                        disabled={isSubmittingWastage}
                      >
                        <SelectTrigger id="reason">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="End-of-day unsold">End-of-day unsold</SelectItem>
                          <SelectItem value="Over-preparation">Over-preparation</SelectItem>
                          <SelectItem value="Kitchen spoiled/burnt">Kitchen spoiled/burnt</SelectItem>
                          <SelectItem value="Customer returned">Customer returned</SelectItem>
                          <SelectItem value="Expired / Shelf-life exceeded">Expired / Shelf-life exceeded</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="prepQty">Prepared Quantity (Portions/Units) *</Label>
                      <Input
                        id="prepQty"
                        type="number"
                        min="0.1"
                        step="any"
                        placeholder="e.g. 50"
                        value={wastagePrepQty}
                        onChange={(e) => setWastagePrepQty(e.target.value)}
                        required
                        disabled={isSubmittingWastage}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wasteQty">Wasted Quantity (Portions/Units) *</Label>
                      <Input
                        id="wasteQty"
                        type="number"
                        min="0.1"
                        step="any"
                        placeholder="e.g. 8"
                        value={wastageWasteQty}
                        onChange={(e) => setWastageWasteQty(e.target.value)}
                        required
                        disabled={isSubmittingWastage}
                      />
                    </div>
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
                      <Label htmlFor="item">Broken Item Name *</Label>
                      <Input
                        id="item"
                        placeholder="e.g. Dinner Plate, Water Glass, Tea Cup"
                        value={breakageItem}
                        onChange={(e) => setBreakageItem(e.target.value)}
                        required
                        disabled={isSubmittingBreakage}
                      />
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
                      <Select
                        value={breakageReason}
                        onValueChange={setBreakageReason}
                        disabled={isSubmittingBreakage}
                      >
                        <SelectTrigger id="breakReason">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Handling damage">Handling damage</SelectItem>
                          <SelectItem value="Dropped">Dropped by steward/customer</SelectItem>
                          <SelectItem value="Damaged during washing">Damaged during washing</SelectItem>
                          <SelectItem value="Chipped/Cracked">Chipped/Cracked (wear & tear)</SelectItem>
                        </SelectContent>
                      </Select>
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
