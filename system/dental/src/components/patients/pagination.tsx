"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useI18n } from "@/components/lang-provider"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PaginationProps {
  page: number
  totalPages: number
  totalItems: number
  perPage: number
  basePath?: string
  preservedQuery?: string
}

function buildUrl(basePath: string, preservedQuery: string, page: number): string {
  const qs = new URLSearchParams(preservedQuery)
  if (page > 1) qs.set("page", String(page))
  else qs.delete("page")
  const s = qs.toString()
  return s ? `${basePath}?${s}` : basePath
}

function navBtn(base: string) {
  return cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8", base)
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  perPage,
  basePath = "/patients",
  preservedQuery = "",
}: PaginationProps) {
  const { t } = useI18n()
  if (totalItems === 0) return null

  const from = (page - 1) * perPage + 1
  const to = Math.min(page * perPage, totalItems)

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        {from}–{to} {t.common.of} {totalItems}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={buildUrl(basePath, preservedQuery, page - 1)} className={navBtn("")} aria-label={t.common.previous}>
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </Link>
        ) : (
          <span className={navBtn("pointer-events-none opacity-50")} aria-hidden="true">
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </span>
        )}
        <span className="px-3 text-sm tabular-nums">
          {t.common.page} {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <Link href={buildUrl(basePath, preservedQuery, page + 1)} className={navBtn("")} aria-label={t.common.next}>
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        ) : (
          <span className={navBtn("pointer-events-none opacity-50")} aria-hidden="true">
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </span>
        )}
      </div>
    </div>
  )
}