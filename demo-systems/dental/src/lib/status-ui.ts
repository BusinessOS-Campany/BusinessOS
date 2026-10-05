const colorFor = (hue: string): { border: string; text: string; bg: string } => ({
  border: `hsl(${hue} / 0.4)`,
  text: `hsl(${hue})`,
  bg: `hsl(${hue} / 0.1)`,
})

const GREEN = "158 84% 39%"
const AMBER = "38 92% 50%"
const RED = "0 72% 51%"
const BLUE = "217 91% 60%"
const GRAY = "215 16% 47%"
const PRIMARY = "174 55% 34%"

const STATUS_MAP: Record<string, ReturnType<typeof colorFor>> = {
  SCHEDULED: colorFor(BLUE),
  CONFIRMED: colorFor(PRIMARY),
  CHECKED_IN: colorFor(AMBER),
  IN_TREATMENT: colorFor(RED),
  COMPLETED: colorFor(GREEN),
  CANCELLED: colorFor(GRAY),
  NO_SHOW: colorFor(GRAY),
  RESCHEDULED: colorFor(AMBER),

  DRAFT: colorFor(GRAY),
  ISSUED: colorFor(BLUE),
  PARTIALLY_PAID: colorFor(AMBER),
  PAID: colorFor(GREEN),
  REFUNDED: colorFor(PRIMARY),

  WAITING: colorFor(BLUE),
  CALLED: colorFor(AMBER),
  IN_ROOM: colorFor(RED),
  WITH_DENTIST: colorFor(PRIMARY),

  PROPOSED: colorFor(BLUE),
  ACCEPTED: colorFor(PRIMARY),
  PARTIALLY_COMPLETED: colorFor(AMBER),
  REJECTED: colorFor(RED),

  PENDING: colorFor(GRAY),
  OVERDUE: colorFor(RED),

  CREATED: colorFor(BLUE),
  SENT: colorFor(BLUE),
  IN_PRODUCTION: colorFor(AMBER),
  READY: colorFor(PRIMARY),
  RECEIVED: colorFor(BLUE),
  DELIVERED: colorFor(GREEN),
  FAILED: colorFor(RED),

  TRANSFER_IN: colorFor(BLUE),
  TRANSFER_OUT: colorFor(AMBER),
  ADJUSTMENT: colorFor(AMBER),
  LOW_INVENTORY: colorFor(RED),

  AVAILABLE: colorFor(GREEN),
  RESERVED: colorFor(AMBER),
  IN_USE: colorFor(RED),
  MAINTENANCE: colorFor(GRAY),

  OPEN: colorFor(RED),
  RESOLVED: colorFor(GREEN),

  STOCK_IN: colorFor(GREEN),
  STOCK_OUT: colorFor(RED),
  SEVERE: colorFor(RED),
  CRITICAL: colorFor(RED),

  RENT: colorFor(GRAY),
  SALARIES: colorFor(BLUE),
  UTILITIES: colorFor(AMBER),
  DENTAL_MATERIALS: colorFor(PRIMARY),
  LABORATORY: colorFor(AMBER),
  EQUIPMENT: colorFor(BLUE),
  MARKETING: colorFor(AMBER),
  OTHER: colorFor(GRAY),
}

export function statusColor(status: string) {
  return STATUS_MAP[status] ?? colorFor(GRAY)
}