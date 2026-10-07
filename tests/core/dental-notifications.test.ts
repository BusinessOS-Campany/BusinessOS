import { describe, expect, it } from "vitest";
import type { NotificationDTO } from "../../system/dental/src/lib/notifications";
import {
  NOTIFICATION_LIMIT,
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
  notifyAppointmentCreated,
  notifyBranchStaff,
  notifyPatientCreated,
} from "../../system/dental/src/lib/notifications";

// The bell in the header was a picture of a bell.
//
// `Notification` has been in the Dental schema since the initial migration
// (with `@@index([userId])` and `@@index([isRead])`, i.e. written for exactly
// this screen), but nothing ever read or wrote it: there was no
// `prisma.notification.*` call anywhere in the app, no route for it, and
// `app-shell.tsx` rendered `<Bell />` with a `bg-destructive` dot that was
// hardcoded — so it was red for a user with nothing unread, and stayed silent
// for a user with a hundred.
//
// Appointment and patient creation are the two events a front desk needs to see
// land, so they are the two producers here.
//
// The invariant these tests pin down is isolation: a notification is addressed
// to a `userId`, so no read path may ever widen past "the caller". `markAllRead`
// implemented as `updateMany({ where: {} })` would mark a whole clinic's
// notifications read for whoever opened the menu, and would look fine in the
// demo with a single user.

type UserRow = { id: string; branchId: string | null; isActive: boolean; deletedAt: Date | null };
/** The real DTO, so the stand-in client below cannot drift from the model's `type`. */
type NotificationRow = NotificationDTO;

function user(id: string, branchId: string | null, over: Partial<UserRow> = {}): UserRow {
  return { id, branchId, isActive: true, deletedAt: null, ...over };
}

function notif(id: string, userId: string, over: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id,
    userId,
    type: "APPOINTMENT_UPCOMING",
    title: "New appointment",
    titleAr: null,
    body: null,
    bodyAr: null,
    link: null,
    isRead: false,
    createdAt: new Date("2026-10-06T10:00:00Z"),
    ...over,
  };
}

/** Minimal stand-in for the Prisma client these five functions touch. */
function fakeDb(users: UserRow[] = [], notifications: NotificationRow[] = []) {
  let seq = 0;
  const matchUser = (row: UserRow, where: Record<string, unknown>) => {
    if (typeof where.branchId === "string" && row.branchId !== where.branchId) return false;
    if (where.isActive === true && !row.isActive) return false;
    if (where.deletedAt === null && row.deletedAt !== null) return false;
    const not = where.id as { not?: string } | undefined;
    if (not?.not && row.id === not.not) return false;
    return true;
  };
  const matchNotif = (row: NotificationRow, where: Record<string, unknown>) => {
    if (typeof where.userId === "string" && row.userId !== where.userId) return false;
    if (typeof where.isRead === "boolean" && row.isRead !== where.isRead) return false;
    const idFilter = where.id as { in?: string[] } | undefined;
    if (idFilter?.in && !idFilter.in.includes(row.id)) return false;
    return true;
  };
  return {
    users,
    notifications,
    user: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        return users.filter((r) => matchUser(r, where));
      },
    },
    notification: {
      async findMany({ where, take }: { where: Record<string, unknown>; take?: number }) {
        const rows = notifications.filter((r) => matchNotif(r, where)).sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
        );
        return take ? rows.slice(0, take) : rows;
      },
      async count({ where }: { where: Record<string, unknown> }) {
        return notifications.filter((r) => matchNotif(r, where)).length;
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Partial<NotificationRow> }) {
        let n = 0;
        for (const row of notifications) {
          if (matchNotif(row, where)) {
            Object.assign(row, data);
            n++;
          }
        }
        return { count: n };
      },
      async createMany({ data }: { data: Omit<NotificationDTO, "id" | "createdAt">[] }) {
        for (const row of data) notifications.push({ ...row, id: `n${++seq}`, createdAt: new Date() });
        return { count: data.length };
      },
    },
  };
}

describe("reading the caller's notifications", () => {
  it("returns only that user's rows, newest first", async () => {
    const db = fakeDb([], [
      notif("a", "me", { createdAt: new Date("2026-10-01T09:00:00Z") }),
      notif("b", "me", { createdAt: new Date("2026-10-05T09:00:00Z") }),
      notif("c", "someone-else", { createdAt: new Date("2026-10-06T09:00:00Z") }),
    ]);

    const rows = await listNotifications(db, "me");

    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("caps the list, because the bell is a dropdown and not an inbox", async () => {
    const db = fakeDb(
      [],
      Array.from({ length: NOTIFICATION_LIMIT + 7 }, (_, i) => notif(`n${i}`, "me")),
    );

    const rows = await listNotifications(db, "me");

    expect(rows).toHaveLength(NOTIFICATION_LIMIT);
  });

  it("counts only the caller's unread rows", async () => {
    const db = fakeDb([], [
      notif("a", "me"),
      notif("b", "me", { isRead: true }),
      notif("c", "me"),
      notif("d", "someone-else"),
    ]);

    expect(await countUnreadNotifications(db, "me")).toBe(2);
  });
});

describe("marking notifications read", () => {
  it("marks the caller's unread rows and nobody else's", async () => {
    const db = fakeDb([], [notif("a", "me"), notif("b", "me"), notif("c", "someone-else")]);

    const updated = await markNotificationsRead(db, "me");

    expect(updated).toBe(2);
    expect(db.notifications.filter((r) => r.userId === "me" && r.isRead)).toHaveLength(2);
    expect(db.notifications.find((r) => r.id === "c")!.isRead).toBe(false);
  });

  it("leaves already-read rows alone", async () => {
    const db = fakeDb([], [notif("a", "me", { isRead: true }), notif("b", "me")]);

    await markNotificationsRead(db, "me");

    expect(await countUnreadNotifications(db, "me")).toBe(0);
  });

  it("ignores ids belonging to another user, so one row cannot be used to read another", async () => {
    const db = fakeDb([], [notif("a", "me"), notif("b", "someone-else")]);

    const updated = await markNotificationsRead(db, "me", ["a", "b"]);

    expect(updated).toBe(1);
    expect(db.notifications.find((r) => r.id === "b")!.isRead).toBe(false);
  });

  it("does nothing for a caller with nothing unread", async () => {
    const db = fakeDb([], []);

    expect(await markNotificationsRead(db, "me")).toBe(0);
  });
});

describe("notifying branch staff", () => {
  it("writes one row per active user in the branch, skipping the actor", async () => {
    const db = fakeDb([
      user("me", "b1"),
      user("colleague", "b1"),
      user("other-branch", "b2"),
      user("suspended", "b1", { isActive: false }),
      user("deleted", "b1", { deletedAt: new Date() }),
    ]);

    const count = await notifyBranchStaff(db, {
      branchId: "b1",
      actorUserId: "me",
      type: "APPOINTMENT_UPCOMING",
      title: "New appointment",
      titleAr: "موعد جديد",
      body: "Amin reid — 09:00",
      bodyAr: "أمين رضا — 09:00",
      link: "/appointments",
    });

    expect(count).toBe(1);
    expect(db.notifications).toHaveLength(1);
    expect(db.notifications[0].userId).toBe("colleague");
    expect(db.notifications[0].titleAr).toBe("موعد جديد");
    expect(db.notifications[0].link).toBe("/appointments");
  });

  it("writes nothing when the actor is the only user in the branch", async () => {
    const db = fakeDb([user("me", "b1")]);

    const count = await notifyBranchStaff(db, {
      branchId: "b1",
      actorUserId: "me",
      type: "APPOINTMENT_UPCOMING",
      title: "New appointment",
      link: "/appointments",
    });

    expect(count).toBe(0);
    expect(db.notifications).toHaveLength(0);
  });
});

describe("the two producers", () => {
  it("announces a new patient to the branch and links to that patient", async () => {
    const db = fakeDb([user("me", "b1"), user("colleague", "b1")]);

    const count = await notifyPatientCreated(db, {
      actorUserId: "me",
      branchId: "b1",
      patientId: "p1",
      patientName: "Amin Reid",
      patientNameAr: "أمين رضا",
    });

    expect(count).toBe(1);
    expect(db.notifications[0].type).toBe("IMPORTANT_PATIENT_EVENT");
    expect(db.notifications[0].link).toBe("/patients/p1");
    expect(db.notifications[0].body).toContain("Amin Reid");
    expect(db.notifications[0].bodyAr).toContain("أمين رضا");
  });

  it("announces a new appointment to the branch and links to appointments", async () => {
    const db = fakeDb([user("me", "b1"), user("colleague", "b1")]);

    const count = await notifyAppointmentCreated(db, {
      actorUserId: "me",
      branchId: "b1",
      patientName: "Amin Reid",
      patientNameAr: "أمين رضا",
      dateLabel: "2026-10-08",
      startTime: "09:00",
    });

    expect(count).toBe(1);
    expect(db.notifications[0].type).toBe("APPOINTMENT_UPCOMING");
    expect(db.notifications[0].link).toBe("/appointments");
    expect(db.notifications[0].body).toContain("09:00");
    expect(db.notifications[0].bodyAr).toContain("09:00");
  });

  it("bilingual, because the app renders Arabic by default", async () => {
    const db = fakeDb([user("me", "b1"), user("colleague", "b1")]);

    await notifyPatientCreated(db, {
      actorUserId: "me",
      branchId: "b1",
      patientId: "p1",
      patientName: "Amin Reid",
      patientNameAr: "أمين رضا",
    });

    expect(db.notifications[0].title).toBeTruthy();
    expect(db.notifications[0].titleAr).toBeTruthy();
  });
});