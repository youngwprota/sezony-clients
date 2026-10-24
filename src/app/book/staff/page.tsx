import { getAllStaff, getNearestSlots, getSalon, getStaffOffers } from "@/lib/booking";
import { bookingHref, parseBookingState } from "@/lib/booking-state";
import { formatDayShort } from "@/lib/time";
import { formatPrice } from "@/lib/money";
import { BackHeader, Page } from "@/components/ui";
import { StaffPicker, type StaffCard } from "./staff-picker";

export const dynamic = "force-dynamic";

export default async function StaffPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const state = parseBookingState(await searchParams);
  const salon = await getSalon();
  const [all, offers, { today, nearest }] = await Promise.all([
    getAllStaff(),
    getStaffOffers(state.serviceIds, salon),
    getNearestSlots(state.serviceIds),
  ]);
  const offerById = new Map(offers.map((o) => [o.id, o]));

  const cards: StaffCard[] = all.map((s) => {
    const offer = offerById.get(s.id);
    const near = nearest.get(s.id);
    return {
      id: s.id,
      name: s.name,
      specialization: s.specialization,
      bio: s.bio,
      avatarUrl: s.avatarUrl,
      available: !!offer,
      price: offer && state.serviceIds.length ? formatPrice(offer.priceMin, offer.priceMax, salon.currency) : null,
      nearestLabel: near ? (near.date === today ? "сегодня" : formatDayShort(near.date)) : null,
      slots: near?.slots.slice(0, 8) ?? [],
    };
  });
  // недоступные для выбранных услуг — в конец списка
  cards.sort((a, b) => Number(b.available) - Number(a.available));

  return (
    <Page>
      <BackHeader href={bookingHref("/", state)} title={salon.name} />
      <h1 className="mt-1 mb-4 text-[26px] font-bold">Выбрать специалиста</h1>
      <StaffPicker state={state} cards={cards} />
    </Page>
  );
}
