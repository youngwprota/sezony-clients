import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { bookingHref, parseBookingState } from "@/lib/booking-state";
import { localDate } from "@/lib/time";
import { BackHeader, Page } from "@/components/ui";
import { TimePicker } from "./time-picker";

export const dynamic = "force-dynamic";

export default async function TimePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const state = parseBookingState(await searchParams);
  const salon = await getSalon();
  const staff = state.staffId ? await db.staff.findUnique({ where: { id: state.staffId }, select: { name: true } }) : null;
  return (
    <Page>
      <BackHeader href={bookingHref("/", state)} title={salon.name} />
      <TimePicker
        state={state}
        staffName={staff?.name ?? null}
        today={localDate(new Date(), salon.timezone)}
        initialDate={state.at ? localDate(new Date(state.at), salon.timezone) : null}
      />
    </Page>
  );
}
