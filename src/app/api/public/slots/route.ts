import { NextResponse, type NextRequest } from "next/server";
import { getDaySlots } from "@/lib/booking";
import { parseBookingState } from "@/lib/booking-state";
import { isoDate } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!isoDate.safeParse(date).success) return NextResponse.json({ error: "date" }, { status: 400 });
  const s = parseBookingState(Object.fromEntries(req.nextUrl.searchParams));
  return NextResponse.json({ slots: await getDaySlots(date, s.staffId, s.serviceIds) });
}
