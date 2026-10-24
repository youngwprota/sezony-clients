import { getCatalog, getSalon } from "@/lib/booking";
import { bookingHref, parseBookingState } from "@/lib/booking-state";
import { BackHeader, Page } from "@/components/ui";
import { ServicePicker } from "./service-picker";

export const dynamic = "force-dynamic";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const state = parseBookingState(await searchParams);
  const [salon, catalog] = await Promise.all([getSalon(), getCatalog(state.staffId)]);
  return (
    <Page>
      <BackHeader href={bookingHref("/", state)} title={salon.name} />
      <h1 className="mt-1 mb-4 text-[26px] font-bold">Выбрать услуги</h1>
      <ServicePicker state={state} catalog={catalog} currency={salon.currency} />
    </Page>
  );
}
