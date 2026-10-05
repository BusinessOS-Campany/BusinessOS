"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useI18n } from "@/components/lang-provider"
import { uploadImagingAction, type ImagingFormState } from "@/lib/actions/imaging"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { IMAGING_TYPES } from "@/lib/constants/imaging"
import { Upload } from "lucide-react"

export type ImagingPatientOption = { id: string; label: string }

interface Props {
  trigger?: React.ReactNode
  patients: ImagingPatientOption[]
  defaultType?: string
}

export function ImagingUploadDialog({ trigger, patients, defaultType = "XRAY_PERIAPICAL" }: Props) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState("")
  const [type, setType] = useState(defaultType)
  const [fileName, setFileName] = useState("")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!patientId) {
      setError(locale === "ar" ? "حدد المريض أولاً" : t.common.select)
      return
    }
    const fd = new FormData(e.currentTarget)
    const file = fd.get("file")
    if (!(file instanceof File) || file.size <= 0) {
      setError(locale === "ar" ? "اختر ملف صورة" : "Select an image file")
      return
    }
    setError(null)
    startTransition(async () => {
      const res: ImagingFormState = await uploadImagingAction({}, fd)
      if (res.ok) {
        router.refresh()
        setOpen(false)
        setPatientId("")
        setFileName("")
      } else if (res.error === "file_too_large") {
        setError(locale === "ar" ? "حجم الملف يتجاوز 10 م.ب" : "File exceeds 10 MB")
      } else {
        setError(locale === "ar" ? "حدث خطأ أثناء الرفع" : t.common.error)
      }
    })
  }

  const ar = locale === "ar"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <DialogHeader>
            <DialogTitle>{t.imaging.upload}</DialogTitle>
            <DialogDescription>{ar ? "ارفع صورة أو أشعة خاصة بالمريض" : "Attach an image or X-ray to the patient record"}</DialogDescription>
          </DialogHeader>

          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="patientId" value={patientId} />
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>{t.patients.fullName} *</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t.imaging.type} *</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.common.select} />
                </SelectTrigger>
                <SelectContent>
                  {IMAGING_TYPES.map((tp) => (
                    <SelectItem key={tp.value} value={tp.value}>
                      {ar ? tp.ar : tp.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="img-title">{t.dentalChart.title === "Dental Chart" ? "Title" : "العنوان"}</Label>
              <Input id="img-title" name="title" placeholder={ar ? "وصف قصير…" : "Short title…"} />
            </div>

            <div className="space-y-1.5">
              <Label>{t.imaging.file} *</Label>
              <Input
                type="file"
                name="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
              {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
              <p className="text-xs text-muted-foreground">{t.imaging.maxSize}</p>
            </div>

            <div className="space-y-1.5">
              <Label>{t.imaging.notes}</Label>
              <Textarea name="notes" rows={2} />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <Upload className="h-4 w-4" />
              {isPending ? t.common.loading : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}