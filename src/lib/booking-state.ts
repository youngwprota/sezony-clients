/** Состояние онлайн-записи хранится в адресной строке, как у YCLIENTS. */
export type BookingState = { staffId: number | null; serviceIds: number[]; at: string | null };

type Params = Record<string, string | string[] | undefined>;

/** Положительное целое, которое помещается в INTEGER базы данных. */
const isDbId = (n: number) => Number.isInteger(n) && n > 0 && n <= 2_147_483_647;

export function parseBookingState(params: Params): BookingState {
  const one = (k: string) => (Array.isArray(params[k]) ? params[k]![0] : (params[k] as string | undefined));
  const staffId = Number(one("staff"));
  const serviceIds = (one("services") ?? "")
    .split(",")
    .slice(0, 50)
    .map(Number)
    .filter(isDbId);
  const at = one("at");
  return {
    staffId: isDbId(staffId) ? staffId : null,
    serviceIds: [...new Set(serviceIds)].slice(0, 10),
    at: at && !Number.isNaN(Date.parse(at)) ? at : null,
  };
}

export function bookingQuery(s: BookingState): string {
  const q = new URLSearchParams();
  if (s.staffId) q.set("staff", String(s.staffId));
  if (s.serviceIds.length) q.set("services", s.serviceIds.join(","));
  if (s.at) q.set("at", s.at);
  const str = q.toString();
  return str ? `?${str}` : "";
}

export function bookingHref(path: string, s: BookingState) {
  return `${path}${bookingQuery(s)}`;
}

/** Следующий незаполненный шаг; когда всё выбрано — подтверждение. */
export function nextStep(s: BookingState): string {
  if (!s.serviceIds.length) return bookingHref("/book/services", s);
  if (!s.at) return bookingHref("/book/time", s);
  return bookingHref("/book/confirm", s);
}
