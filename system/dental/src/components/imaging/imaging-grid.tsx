"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Trash2 } from "lucide-react"
import { useI18n } from "@/components/lang-provider"
import { deleteImagingAction } from "@/lib/actions/imaging"
import { imagingTypeLabel } from "@/lib/constants/imaging"
import { formatDateTime } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export interface ImagingCardRecord {
  id: string
  type: string
  title: string | null
  notes: string | null
  filePath: string
  mimeType: string | null
  date: string
  patientId: string
  patientName: string
  patientNo: string
}

interface Props {
  records: ImagingCardRecord[]
  canDelete: boolean
}

export function ImagingGrid({ records, canDelete }: Props) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (records.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">{t.imaging.noData}</div>
    )
  }

  function onDelete(id: string) {
    if (!window.confirm(t.imaging.deleteConfirm)) return
    startTransition(async () => {
      await deleteImagingAction(id)
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {records.map((r) => {
        const src = r.mimeType?.startsWith("image/") ? `/api/files/${r.filePath}` : null
        return (
          <Card key={r.id} className="overflow-hidden">
            {src ? (
              <div className="relative aspect-video w-full bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={r.title ?? r.type} className="h-full w-full object-contain" loading="lazy" />
              </div>
            ) : (
              <div className="flex aspect-video w-full items-center justify-center bg-muted text-sm text-muted-foreground">
                {r.mimeType ?? "file"}
              </div>
            )}
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.title ?? imagingTypeLabel(r.type, locale)}</p>
                  <span className="inline-flex rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    {imagingTypeLabel(r.type, locale)}
                  </span>
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() => onDelete(r.id)}
                    title={t.imaging.delete}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Link href={`/patients/${r.patientId}`} className="mt-2 block text-xs text-muted-foreground hover:underline">
                {r.patientName} · {r.patientNo}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.date, locale)}</p>
              {r.notes && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.notes}</p>}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}