import { NextResponse, type NextRequest } from "next/server";
import { getDaySlots } from "@/lib/booking";
import { parseBookingState } from "@/lib/booking-state";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date" }, { status: 400 });
  const s = parseBookingState(Object.fromEntries(req.nextUrl.searchParams));
  return NextResponse.json({ slots: await getDaySlots(date, s.staffId, s.serviceIds) });
}
