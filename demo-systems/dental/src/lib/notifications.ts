// Relative, not `@/`: the ERP's root tsconfig maps `@` at its own `src`, and this
// module is imported by `tests/core/dental-notifications.test.ts`, so an aliased
// import would only resolve under the Dental app's tsconfig. Same reason
// `prisma/org-structure.ts` imports nothing.
import type { NotificationType } from "../generated/prisma/client"

// What the header bell was missing.
//
// `Notification` has been in the Dental schema since the initial migration, with
// `@@index([userId])` and `@@index([isRead])` — indexes written for exactly this
// screen — but nothing ever read or wrote it. There was no
// `prisma.notification.*` call in the app, no route for it, and `app-shell.tsx`
// rendered `<Bell />` next to a `bg-destructive` dot that was hardcoded in the
// markup. So it was red for a user with nothing unread, and stayed silent for a
// user with a hundred waiting.
//
// A notification is addressed to a `userId`, so every read path here is scoped
// to the caller. The one that would be easy to get wrong is `markAllRead`: as
// `updateMany({ where: {} })` it marks a whole clinic's notifications read for
// whoever opened the menu, and it looks correct in the demo because the demo has
// a single user.

export const NOTIFICATION_LIMIT = 20

export interface NotificationDTO {
  id: string
  /** Who it is addressed to. Every read path filters on this. */
  userId: string
  type: NotificationType
  title: string
  titleAr: string | null
  body: string | null
  bodyAr: string | null
  link: string | null
  isRead: boolean
  createdAt: Date
}

type NewNotification = Omit<NotificationDTO, "id" | "createdAt">

/** The slice of the generated Prisma client this file touches. */
type NotificationClient = {
  user: {
    findMany(args?: unknown): Promise<{ id: string }[]>
  }
  notification: {
    findMany(args?: unknown): Promise<NotificationDTO[]>
    count(args?: unknown): Promise<number>
    updateMany(args?: unknown): Promise<{ count: number }>
    createMany(args: { data: NewNotification[] }): Promise<{ count: number }>
  }
}

export interface BranchNotice {
  branchId: string
  actorUserId: string
  type: NotificationType
  title: string
  titleAr?: string | null
  body?: string | null
  bodyAr?: string | null
  link?: string | null
}

/**
 * Newest first, and capped: this feeds a dropdown, not an inbox page.
 */
export async function listNotifications(
  prisma: NotificationClient,
  userId: string,
  limit: number = NOTIFICATION_LIMIT,
): Promise<NotificationDTO[]> {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}

export async function countUnreadNotifications(
  prisma: NotificationClient,
  userId: string,
): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } })
}

/**
 * Marks the caller's notifications read and returns how many changed. With no
 * `ids`, only the caller's *unread* rows; with `ids`, still only the caller's —
 * an id belonging to somebody else is ignored rather than honoured.
 */
export async function markNotificationsRead(
  prisma: NotificationClient,
  userId: string,
  ids?: readonly string[],
): Promise<number> {
  const where = ids?.length
    ? { userId, id: { in: [...ids] } }
    : { userId, isRead: false }
  const { count } = await prisma.notification.updateMany({ where, data: { isRead: true } })
  return count
}

/**
 * Addresses one notice to the branch's active staff, minus whoever caused it.
 *
 * Excluding the actor is the whole reason this is not simply "everyone": you
 * have just booked the appointment, you do not need to be told about it.
 */
export async function notifyBranchStaff(
  prisma: NotificationClient,
  notice: BranchNotice,
): Promise<number> {
  const recipients = await prisma.user.findMany({
    where: {
      branchId: notice.branchId,
      isActive: true,
      deletedAt: null,
      id: { not: notice.actorUserId },
    },
    select: { id: true },
  })
  if (recipients.length === 0) return 0

  const { count } = await prisma.notification.createMany({
    data: recipients.map((r) => ({
      userId: r.id,
      type: notice.type,
      title: notice.title,
      titleAr: notice.titleAr ?? null,
      body: notice.body ?? null,
      bodyAr: notice.bodyAr ?? null,
      link: notice.link ?? null,
      isRead: false,
    })),
  })
  return count
}

export async function notifyPatientCreated(
  prisma: NotificationClient,
  input: {
    actorUserId: string
    branchId: string
    patientId: string
    patientName: string
    patientNameAr?: string | null
  },
): Promise<number> {
  const nameAr = input.patientNameAr ?? null
  return notifyBranchStaff(prisma, {
    branchId: input.branchId,
    actorUserId: input.actorUserId,
    type: "IMPORTANT_PATIENT_EVENT",
    title: "New patient registered",
    titleAr: "تم تسجيل مريض جديد",
    body: `${input.patientName} was added to the patient list.`,
    bodyAr: nameAr ? `تمت إضافة ${nameAr} إلى قائمة المرضى.` : null,
    link: `/patients/${input.patientId}`,
  })
}

export async function notifyAppointmentCreated(
  prisma: NotificationClient,
  input: {
    actorUserId: string
    branchId: string
    patientName: string
    patientNameAr?: string | null
    dateLabel: string
    startTime: string
  },
): Promise<number> {
  const nameAr = input.patientNameAr ?? null
  return notifyBranchStaff(prisma, {
    branchId: input.branchId,
    actorUserId: input.actorUserId,
    type: "APPOINTMENT_UPCOMING",
    title: "New appointment booked",
    titleAr: "تم حجز موعد جديد",
    body: `${input.patientName} — ${input.dateLabel} at ${input.startTime}`,
    bodyAr: nameAr ? `${nameAr} — ${input.dateLabel} الساعة ${input.startTime}` : null,
    link: "/appointments",
  })
}