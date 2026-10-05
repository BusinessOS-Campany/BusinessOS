"use client";

import { useState } from "react";
import {
  useLegacyTable,
  getCoreRowModel,
  getSortedRowModel,
  type LegacyColumnDef,
} from "@tanstack/react-table/legacy";
import type { SortingState, PaginationState, RowData } from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface DataTableProps<TData extends RowData> {
  columns: LegacyColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  pagination?: DataTablePagination;
  onPaginationChange?: (pagination: PaginationState) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  addLabel?: string;
  onAdd?: () => void;
  actionsColumn?: LegacyColumnDef<TData>;
  dir?: "rtl" | "ltr";
  emptyMessage?: string;
  className?: string;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  isLoading = false,
  pagination,
  onPaginationChange,
  sorting = [],
  onSortingChange,
  searchValue = "",
  onSearchChange,
  searchPlaceholder,
  addLabel,
  onAdd,
  actionsColumn,
  dir,
  emptyMessage,
  className,
}: DataTableProps<TData>) {
  const effectiveDir =
    (dir ?? (typeof document !== "undefined" ? document.documentElement.dir : "ltr")) || "ltr";
  const isRtl = effectiveDir === "rtl";

  const [localSorting, setLocalSorting] = useState<SortingState>(sorting);
  const tableSorting = onSortingChange ? sorting : localSorting;

  const handleSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === "function" ? updater(localSorting) : updater;
    setLocalSorting(next);
    onSortingChange?.(next);
  };

  const tableColumns = actionsColumn ? [...columns, actionsColumn] : columns;

  const table = useLegacyTable({
    columns: tableColumns,
    data,
    state: { sorting: tableSorting },
    onSortingChange: handleSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;
  const from = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const to = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : data.length;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className={cn(
              "absolute top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400",
              isRtl ? "right-3" : "left-3",
            )}
          />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder ?? "بحث / Search"}
            className={cn(
              "h-9 bg-white dark:bg-neutral-900",
              isRtl ? "pr-9 text-right" : "pl-9",
            )}
            dir={effectiveDir}
          />
        </div>
        {onAdd && addLabel && (
          <Button size="sm" onClick={onAdd} className="shrink-0">
            {addLabel}
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-neutral-200 dark:border-neutral-800">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn("whitespace-nowrap text-xs", isRtl && "text-right")}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {header.isPlaceholder
                            ? null
                            : (header.column.columnDef.header as React.ReactNode)}
                          <ArrowUpDown className="h-3 w-3 shrink-0" />
                        </button>
                      ) : header.isPlaceholder ? null : (
                        (header.column.columnDef.header as React.ReactNode)
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: pagination?.pageSize ?? 5 }).map((_, i) => (
                <TableRow
                  key={`skel-${i}`}
                  className="border-neutral-100 dark:border-neutral-800/50"
                >
                  {tableColumns.map((_, ci) => (
                    <TableCell key={ci} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={tableColumns.length}
                  className="h-32 text-center text-sm text-neutral-400 dark:text-neutral-500"
                >
                  {emptyMessage ?? "لا توجد بيانات / No data"}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800/50 dark:hover:bg-neutral-900"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300",
                        isRtl && "text-right",
                      )}
                    >
                      {cell.getValue() as React.ReactNode}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination && onPaginationChange && (
        <div className="flex items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
          <span>
            {pagination.total > 0
              ? `${from.toLocaleString()}\u2013${to.toLocaleString()} / ${pagination.total.toLocaleString()}`
              : "0 / 0"}
            <span className="ms-1 text-xs text-neutral-400 dark:text-neutral-600">
              {"(صف / page)"}
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1}
              onClick={() =>
                onPaginationChange({
                  pageIndex: pagination.page - 1,
                  pageSize: pagination.pageSize,
                })
              }
            >
              <ChevronLeft className={cn("h-4 w-4", isRtl && "rotate-180")} />
            </Button>
            <span className="min-w-[4rem] text-center text-xs font-medium">
              {pagination.page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= totalPages}
              onClick={() =>
                onPaginationChange({
                  pageIndex: pagination.page + 1,
                  pageSize: pagination.pageSize,
                })
              }
            >
              <ChevronRight className={cn("h-4 w-4", isRtl && "rotate-180")} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
