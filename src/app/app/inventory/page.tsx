"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Warehouse } from "lucide-react";

interface WarehouseItem {
  id: string;
  nameAr: string;
  nameEn: string | null;
  isMain: boolean;
  createdAt: string;
}

export default function InventoryPage() {
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [isMain, setIsMain] = useState(false);

  useEffect(() => {
    loadWarehouses();
  }, []);

  async function loadWarehouses() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/v1/warehouses");
      const json = await res.json();
      const data = json.data;
      setWarehouses(data.warehouses ?? []);
    } catch {
      setError("فشل تحميل بيانات المخازن");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!nameAr.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/v1/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim() || undefined,
          isMain,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        setNameAr("");
        setNameEn("");
        setIsMain(false);
        loadWarehouses();
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background p-6">
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-bold text-foreground">
            المخزون / Inventory
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="ml-2 h-4 w-4" />
                إضافة مخزن / Add Warehouse
              </Button>
            </DialogTrigger>
            <DialogContent className="border-border bg-card">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  إضافة مخزن جديد
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-card-foreground">
                    الاسم بالعربي * / Arabic Name
                  </Label>
                  <Input
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    placeholder="اسم المخزن بالعربي"
                    className="border-border bg-card text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-card-foreground">
                    الاسم بالإنجليزي / English Name
                  </Label>
                  <Input
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Warehouse name in English"
                    className="border-border bg-card text-foreground"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={isMain}
                    onCheckedChange={setIsMain}
                  />
                  <Label className="text-card-foreground">
                    مخزن رئيسي / Main Warehouse
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  className="border-border text-card-foreground"
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!nameAr.trim() || creating}
                >
                  {creating ? "جاري الإنشاء..." : "إنشاء / Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400">{error}</div>
          ) : warehouses.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              لا توجد مخازن حالياً. أضف مخزنًا للبدء.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {warehouses.map((wh) => (
                <Card
                  key={wh.id}
                  className="border-border bg-background transition-colors hover:bg-card"
                >
                  <CardHeader className="flex flex-row items-start justify-between pb-2">
                    <div className="flex items-center gap-2">
                      <Warehouse className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base text-foreground">
                        {wh.nameAr}
                      </CardTitle>
                    </div>
                    {wh.isMain && (
                      <Badge variant="success">رئيسي / Main</Badge>
                    )}
                  </CardHeader>
                  <CardContent>
                    {wh.nameEn && (
                      <p className="text-sm text-muted-foreground">{wh.nameEn}</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      أُنشئ: {new Date(wh.createdAt).toLocaleDateString("ar-SA")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
