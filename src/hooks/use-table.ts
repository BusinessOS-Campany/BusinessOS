"use client";

import { useCallback, useMemo, useState } from "react";
import {
  useLegacyTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type LegacyColumnDef,
  type LegacyTableOptions,
  type LegacyReactTable,
} from "@tanstack/react-table/legacy";
import type {
  SortingState,
  ColumnVisibilityState,
  RowSelectionState,
  RowData,
} from "@tanstack/react-table";

export interface UseTableOptions<TData extends RowData> {
  columns: LegacyColumnDef<TData>[];
  data: TData[];
  manualPagination?: boolean;
  pageCount?: number;
  defaultSorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  onSearchChange?: (value: string) => void;
  globalFilter?: string;
  defaultVisibility?: ColumnVisibilityState;
  getRowId?: (row: TData, index: number) => string;
}

export interface UseTableReturn<TData extends RowData> {
  table: LegacyReactTable<TData>;
  sorting: SortingState;
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  rowSelection: RowSelectionState;
  setRowSelection: React.Dispatch<React.SetStateAction<RowSelectionState>>;
  columnVisibility: ColumnVisibilityState;
  setColumnVisibility: React.Dispatch<React.SetStateAction<ColumnVisibilityState>>;
}

export function useTable<TData extends RowData>({
  columns,
  data,
  manualPagination = false,
  pageCount,
  defaultSorting = [],
  onSortingChange: onSortingChangeProp,
  onSearchChange: onSearchChangeProp,
  globalFilter: globalFilterProp,
  defaultVisibility = {},
  getRowId,
}: UseTableOptions<TData>): UseTableReturn<TData> {
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [globalFilter, setGlobalFilterState] = useState(globalFilterProp ?? "");
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(defaultVisibility);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      onSortingChangeProp?.(next);
    },
    [sorting, onSortingChangeProp],
  );

  const setGlobalFilter = useCallback(
    (value: string) => {
      setGlobalFilterState(value);
      onSearchChangeProp?.(value);
    },
    [onSearchChangeProp],
  );

  const tableOptions: LegacyTableOptions<TData> = {
    columns,
    data,
    state: {
      sorting,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
    onSortingChange: handleSortingChange,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualPagination,
    pageCount,
    getRowId,
  };

  const table = useLegacyTable(tableOptions);

  return useMemo(
    () => ({
      table,
      sorting,
      setSorting,
      globalFilter,
      setGlobalFilter,
      rowSelection,
      setRowSelection,
      columnVisibility,
      setColumnVisibility,
    }),
    [table, sorting, globalFilter, rowSelection, columnVisibility, setGlobalFilter],
  );
}
