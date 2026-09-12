"use client";

import { FileSpreadsheet, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface ReportCsvRow {
  label: string;
  value: string;
}

/**
 * Export/print controls for the Reports page.
 *
 * - "Export CSV" is a genuine client-side download built from the same
 *   small, already-server-aggregated summary rows rendered on the page
 *   (a handful of labeled figures) — never raw sales/sale-item data, and
 *   no new dependency (a plain CSV string + `Blob`).
 * - "Print" uses the browser's own `window.print()` — a real feature,
 *   not a fabrication.
 * - "Export PDF" has no backing generation mechanism in this project, so
 *   it stays a clearly-labeled prototype action using the same toast
 *   pattern already used for the local Wastage/Breakage CRUD sections,
 *   rather than pretending a PDF was produced.
 */
export function ReportExportControls({ rows, fileName }: { rows: ReportCsvRow[]; fileName: string }) {
  const exportCsv = () => {
    const csv = ["Metric,Value", ...rows.map((row) => `"${row.label.replace(/"/g, '""')}",${row.value}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report summary exported as CSV.");
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="bg-card rounded-xl px-3" onClick={exportCsv}>
        <FileSpreadsheet className="text-muted-foreground h-4 w-4" /> Export CSV
      </Button>
      <Button
        variant="outline"
        className="bg-card rounded-xl px-3"
        onClick={() =>
          toast("PDF export is not connected yet", {
            description: "A report-generation service can be connected during application integration.",
          })
        }
      >
        <FileText className="text-muted-foreground h-4 w-4" /> Export PDF
      </Button>
      <Button variant="outline" className="bg-card rounded-xl px-3" onClick={() => window.print()}>
        <Printer className="text-muted-foreground h-4 w-4" /> Print
      </Button>
    </div>
  );
}
