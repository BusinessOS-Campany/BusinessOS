import { prisma } from "@/core/db/client";

export async function getDashboardKpis(organizationId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [
    todaySessions,
    todayAppointments,
    todayIncome,
    newPatientsToday,
    totalPatients,
    activePatients,
    totalEmployees,
  ] = await Promise.all([
    prisma.samaSession.count({
      where: {
        organizationId,
        deletedAt: null,
        sessionDate: { gte: startOfDay, lt: endOfDay },
      },
    }),
    prisma.samaAppointment.count({
      where: {
        organizationId,
        deletedAt: null,
        date: { gte: startOfDay, lt: endOfDay },
      },
    }),
    prisma.samaSession.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        sessionDate: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { price: true },
    }),
    prisma.samaPatient.count({
      where: {
        organizationId,
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
    }),
    prisma.samaPatient.count({
      where: { organizationId },
    }),
    prisma.samaPatient.count({
      where: { organizationId, isActive: true },
    }),
    prisma.samaEmployee.count({
      where: { organizationId, isActive: true },
    }),
  ]);

  return {
    todaySessions,
    todayAppointments,
    todayIncome: todayIncome._sum.price ?? 0n,
    newPatientsToday,
    totalPatients,
    activePatients,
    totalEmployees,
  };
}

export async function getDailySummary(organizationId: string, date?: Date) {
  const target = date ?? new Date();
  const startOfDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [sessions, advances] = await Promise.all([
    prisma.samaSession.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        sessionDate: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { price: true },
      _count: { _all: true },
    }),
    prisma.samaAdvance.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        date: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const income = sessions._sum.price ?? 0n;
  const expenses = advances._sum.amount ?? 0n;

  return {
    date: startOfDay,
    income,
    expenses,
    net: income - expenses,
    sessionsCount: sessions._count._all,
    advancesCount: advances._count._all,
  };
}

export async function getWeeklySummary(organizationId: string, weekStart?: Date) {
  const start = weekStart ?? new Date();
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const [sessions, advances] = await Promise.all([
    prisma.samaSession.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        sessionDate: { gte: start, lt: end },
      },
      _sum: { price: true },
      _count: { _all: true },
    }),
    prisma.samaAdvance.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        date: { gte: start, lt: end },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const income = sessions._sum.price ?? 0n;
  const expenses = advances._sum.amount ?? 0n;

  return {
    weekStart: start,
    weekEnd: end,
    income,
    expenses,
    net: income - expenses,
    sessionsCount: sessions._count._all,
    advancesCount: advances._count._all,
  };
}

export async function getMonthlySummary(
  organizationId: string,
  month?: number,
  year?: number,
) {
  const now = new Date();
  const m = month ?? now.getMonth();
  const y = year ?? now.getFullYear();

  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);

  const [sessions, advances, newPatients] = await Promise.all([
    prisma.samaSession.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        sessionDate: { gte: start, lt: end },
      },
      _sum: { price: true },
      _count: { _all: true },
    }),
    prisma.samaAdvance.aggregate({
      where: {
        organizationId,
        deletedAt: null,
        date: { gte: start, lt: end },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.samaPatient.count({
      where: {
        organizationId,
        createdAt: { gte: start, lt: end },
      },
    }),
  ]);

  const income = sessions._sum.price ?? 0n;
  const expenses = advances._sum.amount ?? 0n;

  return {
    month: m,
    year: y,
    income,
    expenses,
    net: income - expenses,
    sessionsCount: sessions._count._all,
    advancesCount: advances._count._all,
    newPatients,
  };
}
