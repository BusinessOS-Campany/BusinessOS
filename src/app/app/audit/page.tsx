"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, Info } from "lucide-react";

export default function AuditPage() {
  return (
    <div dir="rtl" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          سجل التدقيق / Audit Log
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تتبع جميع التغييرات والإجراءات
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 p-4">
        <Info className="h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-card-foreground">
          سجل التدقيق متاح عبر API / Audit log is accessible via API
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border">
              <TableHead className="text-right text-card-foreground">
                التاريخ / Date
              </TableHead>
              <TableHead className="text-right text-card-foreground">
                المستخدم / User
              </TableHead>
              <TableHead className="text-right text-card-foreground">
                الإجراء / Action
              </TableHead>
              <TableHead className="text-right text-card-foreground">
                الكيان / Entity
              </TableHead>
              <TableHead className="text-right text-card-foreground">
                التفاصيل / Details
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5}>
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Shield className="mb-3 h-12 w-12 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">
                    لا توجد سجلات متاحة حالياً
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    سيتم عرض سجلات التدقيق هنا عند توفرها من الخادم
                  </p>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
