"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  FolderTree,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  ListTree,
  LayoutList,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  parentName: string | null;
  parentId: string | null;
  productCount: number;
  sortOrder: number;
  isActive: boolean;
  children?: Category[];
}

interface Filters {
  search: string;
  page: number;
  pageSize: number;
}

const emptyForm = {
  nameAr: "",
  nameEn: "",
  parentId: "",
  sortOrder: "0",
};

function buildTree(items: Category[]): Category[] {
  const map = new Map<string, Category>();
  const roots: Category[] = [];
  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function TreeRow({
  node,
  depth,
  onEdit,
  onDelete,
}: {
  node: Category;
  depth: number;
  onEdit: (c: Category) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <>
      <TableRow>
        <TableCell>
          <div
            className="flex items-center gap-2"
            style={{ paddingRight: `${depth * 24}px` }}
          >
            {hasChildren ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
              </Button>
            ) : (
              <span className="w-6" />
            )}
            <span className="font-medium">{node.nameAr}</span>
          </div>
        </TableCell>
        <TableCell>{node.nameEn}</TableCell>
        <TableCell>{node.productCount}</TableCell>
        <TableCell>{node.sortOrder}</TableCell>
        <TableCell>
          <Badge variant={node.isActive ? "success" : "secondary"}>
            {node.isActive ? "نشط" : "غير نشط"}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onEdit(node)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
              onClick={() => onDelete(node.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded &&
        hasChildren &&
        node.children!.map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}

export default function GroceryCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: "",
    page: 1,
    pageSize: 20,
  });
  const [viewMode, setViewMode] = useState<"table" | "tree">("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      params.set("page", String(filters.page));
      params.set("pageSize", String(filters.pageSize));

      const res = await fetch(
        `/api/v1/grocery/categories?${params.toString()}`
      );
      const json = await res.json();
      if (json.ok) {
        setCategories(json.data.items);
        setTotal(json.data.total);
      } else {
        setError("فشل تحميل الأقسام");
      }
    } catch {
      setError("فشل تحميل الأقسام");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const totalPages = Math.ceil(total / filters.pageSize);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function openCreateDialog() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(cat: Category) {
    setEditingId(cat.id);
    setForm({
      nameAr: cat.nameAr,
      nameEn: cat.nameEn,
      parentId: cat.parentId ?? "",
      sortOrder: String(cat.sortOrder),
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId
        ? `/api/v1/grocery/categories/${editingId}`
        : "/api/v1/grocery/categories";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameAr: form.nameAr,
          nameEn: form.nameEn,
          parentId: form.parentId || null,
          sortOrder: Number(form.sortOrder),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        fetchCategories();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    const res = await fetch(`/api/v1/grocery/categories/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) fetchCategories();
  }

  const treeData = buildTree(categories);

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">الأقسام</h1>
          <p className="text-sm text-muted-foreground">
            إدارة أقسام المنتجات والتصنيفات
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/80 text-white"
          onClick={openCreateDialog}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة قسم
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم..."
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                className="pr-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "tree" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("tree")}
              >
                <ListTree className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Activity className="h-5 w-5 animate-pulse text-primary" />
                <span className="text-sm">جاري التحميل...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-48 items-center justify-center">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          ) : categories.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <div className="text-center">
                <FolderTree className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا توجد أقسام
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم (عربي)</TableHead>
                    <TableHead>الاسم (إنجليزي)</TableHead>
                    {viewMode === "table" && <TableHead>القسم الأب</TableHead>}
                    <TableHead>عدد المنتجات</TableHead>
                    <TableHead>الترتيب</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewMode === "tree"
                    ? treeData.map((node) => (
                        <TreeRow
                          key={node.id}
                          node={node}
                          depth={0}
                          onEdit={openEditDialog}
                          onDelete={handleDelete}
                        />
                      ))
                    : categories.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">
                            {c.nameAr}
                          </TableCell>
                          <TableCell>{c.nameEn}</TableCell>
                          <TableCell>{c.parentName ?? "—"}</TableCell>
                          <TableCell>{c.productCount}</TableCell>
                          <TableCell>{c.sortOrder}</TableCell>
                          <TableCell>
                            <Badge
                              variant={c.isActive ? "success" : "secondary"}
                            >
                              {c.isActive ? "نشط" : "غير نشط"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openEditDialog(c)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                                onClick={() => handleDelete(c.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {viewMode === "table" && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-2 py-3 mt-4">
              <span className="text-xs text-muted-foreground">
                {total} قسم — صفحة {filters.page} من {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page >= totalPages}
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "تعديل القسم" : "إضافة قسم"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>الاسم (عربي)</Label>
              <Input
                value={form.nameAr}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nameAr: e.target.value }))
                }
                placeholder="الاسم بالعربي"
              />
            </div>
            <div className="space-y-2">
              <Label>الاسم (إنجليزي)</Label>
              <Input
                value={form.nameEn}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nameEn: e.target.value }))
                }
                placeholder="English name"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>القسم الأب</Label>
              <Select
                value={form.parentId}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, parentId: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="بدون قسم أب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون قسم أب</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الترتيب</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, sortOrder: e.target.value }))
                }
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              <X className="ml-2 h-4 w-4" />
              إلغاء
            </Button>
            <Button
              className="bg-primary hover:bg-primary/80 text-white"
              onClick={handleSave}
              disabled={saving || !form.nameAr || !form.nameEn}
            >
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
