"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { translateKey } from "@/lib/client-i18n";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "money" | "select" | "switch" | "textarea";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  step?: string;
  full?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean | null;
};

export type ColumnDef = {
  key: string;
  label: string;
  align?: "start" | "end" | "center";
  format?: "text" | "money" | "number" | "boolean" | "badge" | "date";
  subKey?: string;
};

export type Row = Record<string, unknown> & { id: string };

export function ResourceTable({
  locale,
  title,
  description,
  fields,
  columns,
  rows,
  saveAction,
  deleteAction,
  createLabel,
  searchKeys,
  emptyTitle,
  emptyDescription,
  extraActions,
}: {
  locale: Locale;
  title: string;
  description?: string;
  fields: FieldDef[];
  columns: ColumnDef[];
  rows: Row[];
  saveAction: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
  deleteAction?: (id: string) => Promise<{ ok: boolean }>;
  createLabel: string;
  searchKeys: string[];
  emptyTitle: string;
  emptyDescription?: string;
  extraActions?: (row: Row) => React.ReactNode;
}) {
  const t = (k: string) => translateKey(locale, k);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [pending, startTransition] = useTransition();

  const emptyForm = useMemo(() => {
    const f: Record<string, unknown> = {};
    for (const field of fields) f[field.key] = field.defaultValue ?? (field.type === "switch" ? true : field.type === "number" || field.type === "money" ? 0 : "");
    return f;
  }, [fields]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)));
  }, [rows, query, searchKeys]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(row: Row) {
    setEditingId(row.id);
    const f: Record<string, unknown> = {};
    for (const field of fields) f[field.key] = row[field.key] ?? emptyForm[field.key];
    setForm(f);
    setOpen(true);
  }

  function save() {
    for (const field of fields) {
      if (field.required && !String(form[field.key] ?? "").trim()) {
        toast.error(`${field.label} ${locale === "ar" ? "مطلوب" : "is required"}`);
        return;
      }
    }
    startTransition(async () => {
      try {
        await saveAction(editingId ? { ...form, id: editingId } : form);
        toast.success(t("common.saved"));
        setOpen(false);
      } catch {
        toast.error(t("common.unpublished"));
      }
    });
  }

  function remove(row: Row) {
    if (!deleteAction) return;
    if (!confirm(t("common.deleteConfirm"))) return;
    startTransition(async () => {
      await deleteAction(row.id);
      toast.success(t("common.deleted"));
    });
  }

  function renderCell(row: Row, col: ColumnDef) {
    const value = row[col.key];
    if (col.format === "money") return fmtMoney(BigInt(Math.round(Number(value ?? 0) * 100)), locale);
    if (col.format === "number") return fmtNumber(Number(value ?? 0));
    if (col.format === "date") return value ? new Date(String(value)).toLocaleDateString(locale === "ar" ? "ar-YE" : "en-GB") : "—";
    if (col.format === "boolean") return value ? <Badge variant="success">{locale === "ar" ? "نشط" : "Active"}</Badge> : <Badge variant="secondary">{locale === "ar" ? "موقوف" : "Inactive"}</Badge>;
    if (col.format === "badge") return <Badge variant="secondary">{String(value ?? "—")}</Badge>;
    return (
      <div>
        <div>{String(value ?? "—")}</div>
        {col.subKey && row[col.subKey] ? <div className="text-xs text-muted-foreground">{String(row[col.subKey])}</div> : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Button onClick={openCreate}>
            <Plus /> {createLabel}
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-9" placeholder={t("common.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Layers} title={emptyTitle} description={emptyDescription} action={<Button onClick={openCreate}><Plus /> {createLabel}</Button>} />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : ""}>
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className="text-end">{locale === "ar" ? "إجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : ""}>
                      {renderCell(row, c)}
                    </TableCell>
                  ))}
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      {extraActions?.(row)}
                      <Button variant="ghost" size="iconSm" onClick={() => openEdit(row)}>
                        <Pencil />
                      </Button>
                      {deleteAction ? (
                        <Button variant="ghost" size="iconSm" onClick={() => remove(row)}>
                          <Trash2 className="text-destructive" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? (locale === "ar" ? "تعديل" : "Edit") : createLabel}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className={field.full || field.type === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
                <Label>{field.label}{field.required ? " *" : ""}</Label>
                {field.type === "textarea" ? (
                  <Textarea value={String(form[field.key] ?? "")} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))} />
                ) : field.type === "switch" ? (
                  <div className="flex h-9 items-center">
                    <Switch checked={Boolean(form[field.key])} onCheckedChange={(v) => setForm((f) => ({ ...f, [field.key]: v }))} />
                  </div>
                ) : field.type === "select" ? (
                  <Select value={String(form[field.key] ?? "")} onValueChange={(v) => setForm((f) => ({ ...f, [field.key]: v }))}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {field.options?.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.type === "number" || field.type === "money" ? "number" : "text"}
                    step={field.step ?? (field.type === "money" ? "0.01" : undefined)}
                    placeholder={field.placeholder}
                    value={String(form[field.key] ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, [field.key]: field.type === "number" || field.type === "money" ? Number(e.target.value) : e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={pending}>{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}