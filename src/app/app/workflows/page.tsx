"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Zap, Plus, Clock, Calendar, Power } from "lucide-react";

interface WorkflowRule {
  id: string;
  name: string;
  triggerEvent: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>[];
  isActive: boolean;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

const TRIGGER_OPTIONS = [
  { value: "sale.created", label: "بيع جديد / Sale Created" },
  { value: "stock.low", label: "_stock منخفض / Stock Low" },
  { value: "purchase.created", label: "شراء جديد / Purchase Created" },
  { value: "invoice.overdue", label: "فاتورة متأخرة / Invoice Overdue" },
  { value: "customer.created", label: "عميل جديد / Customer Created" },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WorkflowsPage() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/admin/workflows");
        const json = await res.json();
        if (!cancelled) setRules(json.data?.rules ?? []);
      } catch {
        if (!cancelled) setRules([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormTrigger("");
    setFormEnabled(true);
    setFormError("");
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      setFormError("الاسم مطلوب");
      return;
    }
    if (!formTrigger) {
      setFormError("الحدث المُحفِّز مطلوب");
      return;
    }
    setCreating(true);
    setFormError("");
    try {
      const res = await fetch("/api/v1/admin/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          triggerEvent: formTrigger,
          conditions: {},
          actions: [{ type: "notify" }],
          isActive: formEnabled,
          isDraft: false,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFormError(json.error ?? "حدث خطأ أثناء إنشاء سير العمل");
        return;
      }
      setDialogOpen(false);
      resetForm();
      {
        const res2 = await fetch("/api/v1/admin/workflows");
        const json2 = await res2.json();
        setRules(json2.data?.rules ?? []);
      }
    } catch {
      setFormError("حدث خطأ أثناء الاتصال بالخادم");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            الأتمتة / Workflows
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            إدارة سير العمل والأتمتة
          </p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button className="bg-primary text-white hover:bg-primary/90">
              <Plus className="ml-2 h-4 w-4" />
              إضافة سير عمل / Add Workflow
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>إضافة سير عمل جديد</DialogTitle>
              <DialogDescription>
                أدخل تفاصيل سير العمل. الحقول المؤشر عليها مطلوبة.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="wf-name">
                  الاسم <span className="text-red-400">*</span>
                </Label>
                <Input
                  id="wf-name"
                  placeholder="اسم سير العمل"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>
                  الحدث المُحفِّز <span className="text-red-400">*</span>
                </Label>
                <Select value={formTrigger} onValueChange={setFormTrigger}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الحدث المُحفِّز" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-3">
                <div className="space-y-0.5">
                  <Label>تفعيل / Enabled</Label>
                  <p className="text-xs text-muted-foreground">
                    تفعيل سير العمل فور الإنشاء
                  </p>
                </div>
                <Switch
                  checked={formEnabled}
                  onCheckedChange={setFormEnabled}
                />
              </div>
              {formError && (
                <p className="text-sm text-red-400">{formError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={creating}
              >
                إلغاء
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-primary text-white hover:bg-primary/90"
              >
                {creating ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-border bg-card p-6"
            >
              <div className="h-5 w-3/4 rounded bg-secondary" />
              <div className="mt-3 h-4 w-1/2 rounded bg-secondary" />
              <div className="mt-6 flex gap-2">
                <div className="h-5 w-20 rounded-full bg-secondary" />
                <div className="h-5 w-14 rounded-full bg-secondary" />
              </div>
            </div>
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card/50 py-16 text-center">
          <Zap className="mb-3 h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">
            لا توجد سير عمل بعد
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ابدأ بإضافة أول سير عمل للأتمتة
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rules.map((rule) => (
            <Card key={rule.id} className="transition-colors hover:border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base text-foreground">
                    {rule.name}
                  </CardTitle>
                  <Power
                    className={`h-4 w-4 shrink-0 ${
                      rule.isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    {rule.triggerEvent}
                  </Badge>
                  <Badge
                    variant={rule.isActive ? "success" : "destructive"}
                    className="text-xs"
                  >
                    {rule.isActive ? "مُفعّل" : "معطّل"}
                  </Badge>
                  {rule.isDraft && (
                    <Badge variant="warning" className="text-xs">
                      مسودة
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      آخر تحديث: {formatDate(rule.updatedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>أنشئ: {formatDate(rule.createdAt)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
