import { NextResponse, type NextRequest } from "next/server";
import { getAvailableDates } from "@/lib/booking";
import { parseBookingState } from "@/lib/booking-state";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const s = parseBookingState(Object.fromEntries(req.nextUrl.searchParams));
  return NextResponse.json({ dates: await getAvailableDates(s.staffId, s.serviceIds) });
}
