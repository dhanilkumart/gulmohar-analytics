"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState } from "@/components/dashboard/ui-kit";

/**
 * Generic, reusable data table with client-side search/sort/filter/
 * pagination, ported from the Lovable UI's
 * src/components/app/data-table.tsx (+ the filter-bar pieces from
 * src/components/app/filters.tsx it depends on — Lovable's DateRangePicker/
 * ComparisonSelector from that same file are NOT ported here, since the
 * MAIN project already has its own global equivalents from Step 4).
 *
 * Intended for already-server-aggregated rows only (e.g. one row per
 * product) — never raw sales/sale-item rows.
 */

export type Column<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  sortValue?: (row: T) => number | string | undefined;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type SelectFilter<T> = {
  key: string;
  label: string;
  options: string[];
  match: (row: T, value: string) => boolean;
};

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-0 sm:w-64">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 rounded-xl pl-9"
      />
    </div>
  );
}

export function FilterDropdown({
  value,
  onValueChange,
  label,
  options,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 w-full rounded-xl sm:w-48">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{label}: All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ClearFilters({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="text-muted-foreground h-9 rounded-xl">
      <X /> Clear filters
    </Button>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}

export function DataTable<T>({
  rows,
  columns,
  searchKeys,
  filters = [],
  pageSize = 8,
  loading = false,
  onRowClick,
  emptyMessage = "No rows match your filters.",
  toolbar,
  error,
  rowKey,
}: {
  rows: T[];
  columns: Column<T>[];
  searchKeys?: (row: T) => string;
  filters?: SelectFilter<T>[];
  pageSize?: number;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  toolbar?: ReactNode;
  error?: string;
  rowKey?: (row: T) => string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [filterState, setFilterState] = useState<Record<string, string>>({});

  const processed = useMemo(() => {
    let out = [...rows];
    if (query && searchKeys) {
      const q = query.toLowerCase();
      out = out.filter((row) => searchKeys(row).toLowerCase().includes(q));
    }
    filters.forEach((filter) => {
      const value = filterState[filter.key];
      if (value && value !== "__all") out = out.filter((row) => filter.match(row, value));
    });
    if (sort) {
      const column = columns.find((c) => c.key === sort.key);
      const getSortValue = column?.sortValue;
      if (getSortValue) {
        out.sort((a, b) => {
          const av = getSortValue(a);
          const bv = getSortValue(b);
          const cmp =
            typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, query, filters, filterState, sort, columns, searchKeys]);

  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = processed.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  const hasFilters = query.length > 0 || Object.values(filterState).some((v) => v && v !== "__all");
  const clearFilters = () => {
    setQuery("");
    setFilterState({});
    setPage(0);
  };

  return (
    <div className="min-w-0">
      {(searchKeys || filters.length > 0 || toolbar) && (
        <FilterBar>
          {searchKeys ? (
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(0);
              }}
            />
          ) : null}
          {filters.map((filter) => (
            <FilterDropdown
              key={filter.key}
              value={filterState[filter.key] ?? "__all"}
              onValueChange={(value) => {
                setFilterState((s) => ({ ...s, [filter.key]: value }));
                setPage(0);
              }}
              label={filter.label}
              options={filter.options}
            />
          ))}
          {hasFilters ? <ClearFilters onClick={clearFilters} /> : null}
          {toolbar ? <div className="sm:ml-auto">{toolbar}</div> : null}
        </FilterBar>
      )}

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState title="No results" message={emptyMessage} />
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-border border-b">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "text-muted-foreground px-3 py-2.5 text-xs font-semibold tracking-wide uppercase",
                      c.align === "right" ? "text-right" : "text-left"
                    )}
                  >
                    {c.sortValue ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "h-auto gap-1 p-0 text-xs font-semibold uppercase shadow-none hover:bg-transparent hover:text-foreground",
                          sort?.key === c.key && "text-foreground"
                        )}
                      >
                        {c.header}
                        {sort?.key === c.key ? (
                          sort.dir === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </Button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr
                  key={rowKey?.(row) ?? i}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    "border-border/70 border-b transition-colors last:border-0",
                    onRowClick && "hover:bg-secondary/70 cursor-pointer"
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn("px-3 py-3 align-middle", c.align === "right" ? "num text-right" : "text-left", c.className)}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && processed.length > pageSize ? (
        <div className="text-muted-foreground mt-4 flex items-center justify-between gap-3 text-xs">
          <span className="num">
            Showing {current * pageSize + 1}–{Math.min((current + 1) * pageSize, processed.length)} of{" "}
            {processed.length}
          </span>
          <div className="flex items-center gap-2">
            <span className="num hidden sm:inline">
              Page {current + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              className="rounded-lg px-2"
            >
              <ChevronLeft /> <span className="hidden sm:inline">Previous</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={current >= pageCount - 1}
              onClick={() => setPage(current + 1)}
              className="rounded-lg px-2"
            >
              <span className="hidden sm:inline">Next</span> <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
