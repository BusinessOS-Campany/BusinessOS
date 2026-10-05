"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarDays,
  Pencil,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface CalendarEvent {
  id: string;
  eventName: string;
  date: string;
  endDate: string;
  type: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
}

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEKDAYS_SHORT = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

const eventTypeColors: Record<string, string> = {
  appointment: "bg-primary",
  session: "bg-primary",
  hijama: "bg-purple-600",
  holiday: "bg-red-500",
  meeting: "bg-amber-500",
  other: "bg-blue-500",
};

const eventTypeLabels: Record<string, string> = {
  appointment: "موعد",
  session: "جلسة",
  hijama: "حجامة",
  holiday: "عطلة",
  meeting: "اجتماع",
  other: "أخرى",
};

const emptyForm = {
  eventName: "",
  date: "",
  endDate: "",
  type: "appointment",
  startTime: "",
  endTime: "",
  location: "",
  description: "",
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function SamaCenterCalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const monthName = new Date(currentYear, currentMonth).toLocaleDateString("ar-SA", {
    month: "long",
    year: "numeric",
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        month: String(currentMonth + 1),
        year: String(currentYear),
      });
      const res = await fetch(`/api/v1/sama-center/calendar?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setEvents(json.data.items ?? json.data);
      } else {
        setError("فشل تحميل التقويم");
      }
    } catch {
      setError("فشل تحميل التقويم");
    } finally {
      setLoading(false);
    }
  }, [currentMonth, currentYear]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function openCreateDialog(dateStr?: string) {
    setEditingId(null);
    setForm({ ...emptyForm, date: dateStr ?? "", endDate: dateStr ?? "" });
    setDialogOpen(true);
  }

  function openEditDialog(event: CalendarEvent) {
    setEditingId(event.id);
    setForm({
      eventName: event.eventName,
      date: event.date,
      endDate: event.endDate,
      type: event.type,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      description: event.description,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editingId
        ? `/api/v1/sama-center/calendar/${editingId}`
        : "/api/v1/sama-center/calendar";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.ok) {
        setDialogOpen(false);
        fetchEvents();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    const res = await fetch(`/api/v1/sama-center/calendar/${id}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.ok) fetchEvents();
  }

  function getEventsForDay(day: number): CalendarEvent[] {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => {
      if (e.date <= dateStr && e.endDate >= dateStr) return true;
      return e.date === dateStr;
    });
  }

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const today = new Date();
  const isCurrentMonth =
    today.getMonth() === currentMonth && today.getFullYear() === currentYear;

  return (
    <div dir="rtl" className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">التقويم</h1>
          <p className="text-sm text-muted-foreground">
            إدارة المواعيد والأحداث
          </p>
        </div>
        <Button
          className="bg-primary hover:bg-primary/80 text-white"
          onClick={() => openCreateDialog()}
        >
          <Plus className="ml-2 h-4 w-4" />
          إضافة حدث
        </Button>
      </div>

      {/* Calendar Navigation */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={prevMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <CardTitle className="text-base">{monthName}</CardTitle>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentMonth(new Date().getMonth());
              setCurrentYear(new Date().getFullYear());
            }}
          >
            اليوم
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Activity className="h-5 w-5 animate-pulse text-primary" />
                <span className="text-sm">جاري التحميل...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex items-center gap-3 text-red-400">
                <AlertTriangle className="h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Weekday Headers */}
              <div className="grid grid-cols-7 gap-px">
                {WEEKDAYS.map((day) => (
                  <div
                    key={day}
                    className="p-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-px">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-24 bg-muted/20" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayEvents = getEventsForDay(day);
                  const isToday =
                    isCurrentMonth && day === today.getDate();

                  return (
                    <div
                      key={day}
                      className={cn(
                        "h-24 overflow-hidden border-border bg-background p-1 cursor-pointer transition-colors hover:bg-accent",
                        isToday && "bg-primary/10"
                      )}
                      onClick={() => {
                        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        openCreateDialog(dateStr);
                      }}
                    >
                      <div
                        className={cn(
                          "mb-1 text-xs font-medium",
                          isToday
                            ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white"
                            : "text-muted-foreground"
                        )}
                      >
                        {day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((event) => (
                          <div
                            key={event.id}
                            className={cn(
                              "flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-white",
                              eventTypeColors[event.type] ?? "bg-blue-500"
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(event);
                            }}
                          >
                            <span className="truncate">{event.eventName}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <p className="px-1 text-[10px] text-muted-foreground">
                            +{dayEvents.length - 3} أخرى
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Legend */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            {Object.entries(eventTypeLabels).map(([type, label]) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block h-3 w-3 rounded-full",
                    eventTypeColors[type]
                  )}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "تعديل الحدث" : "إضافة حدث جديد"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>اسم الحدث</Label>
              <Input
                value={form.eventName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, eventName: e.target.value }))
                }
                placeholder="اسم الحدث"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>من تاريخ</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, date: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>إلى تاريخ</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>نوع الحدث</Label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((prev) => ({ ...prev, type: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="appointment">موعد</SelectItem>
                  <SelectItem value="session">جلسة</SelectItem>
                  <SelectItem value="hijama">حجامة</SelectItem>
                  <SelectItem value="holiday">عطلة</SelectItem>
                  <SelectItem value="meeting">اجتماع</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>وقت البداية</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startTime: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>وقت النهاية</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, endTime: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الموقع</Label>
              <Input
                value={form.location}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, location: e.target.value }))
                }
                placeholder="الموقع"
              />
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="وصف الحدث"
              />
            </div>
          </div>
          <DialogFooter>
            <div className="flex w-full items-center justify-between">
              {editingId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                  onClick={() => handleDelete(editingId)}
                >
                  <Trash2 className="ml-2 h-4 w-4" />
                  حذف
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
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
                  disabled={saving || !form.eventName || !form.date}
                >
                  {saving ? "جاري الحفظ..." : "حفظ"}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
