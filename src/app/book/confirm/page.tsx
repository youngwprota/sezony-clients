import Link from "next/link";
import { db } from "@/lib/db";
import { getDaySlots, getSalon, getStaffOffers } from "@/lib/booking";
import { bookingHref, parseBookingState } from "@/lib/booking-state";
import { formatDayLong, formatDuration, localDate, localTime } from "@/lib/time";
import { formatPrice } from "@/lib/money";
import { Avatar, BackHeader, CalendarIcon, Page, PencilIcon, UsersIcon, primaryButton } from "@/components/ui";
import { ConfirmForm } from "./confirm-form";

export const dynamic = "force-dynamic";

export default async function ConfirmPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const state = parseBookingState(await searchParams);
  const salon = await getSalon();
  const back = bookingHref("/", state);

  if (!state.serviceIds.length || !state.at) {
    return (
      <Page>
        <BackHeader href={back} title={salon.name} />
        <p className="py-10 text-center text-muted">Выберите услуги и время записи.</p>
        <Link href={back} className={primaryButton}>Вернуться</Link>
      </Page>
    );
  }

  const startsAt = new Date(state.at);
  const date = localDate(startsAt, salon.timezone);
  const [staff, offers, services, daySlots] = await Promise.all([
    state.staffId ? db.staff.findUnique({ where: { id: state.staffId } }) : null,
    getStaffOffers(state.serviceIds, salon),
    db.service.findMany({ where: { id: { in: state.serviceIds } }, include: { staff: { where: { staffId: state.staffId ?? -1 } } } }),
    getDaySlots(date, state.staffId, state.serviceIds),
  ]);
  const relevant = state.staffId ? offers.filter((o) => o.id === state.staffId) : offers;
  const stillFree = daySlots.some((s) => s.startsAt === startsAt.toISOString());

  const lines = state.serviceIds
    .map((id) => services.find((s) => s.id === id))
    .filter((s) => !!s)
    .map((s) => {
      const o = s.staff[0];
      return {
        id: s.id,
        title: s.title,
        durationMin: o?.durationMin ?? s.durationMin,
        priceMin: Number(o?.priceMin ?? s.priceMin),
        priceMax: Number(o?.priceMax ?? s.priceMax),
      };
    });
  const duration = relevant.length ? Math.min(...relevant.map((o) => o.durationMin)) : lines.reduce((a, l) => a + l.durationMin, 0);
  const priceMin = relevant.length ? Math.min(...relevant.map((o) => o.priceMin)) : 0;
  const priceMax = relevant.length ? Math.max(...relevant.map((o) => o.priceMax)) : 0;
  const total = formatPrice(priceMin, priceMax, salon.currency);
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);

  return (
    <Page>
      <BackHeader href={back} title={salon.name} />
      <h1 className="mt-1 mb-4 text-[26px] font-bold">Детали записи</h1>

      <section className="flex flex-col gap-4 border-b border-line pb-4">
        <DetailRow
          href={bookingHref("/book/staff", state)}
          icon={staff ? <Avatar name={staff.name} url={staff.avatarUrl} /> : <IconCircle><UsersIcon /></IconCircle>}
          title={staff?.name ?? "Любой специалист"}
          subtitle={staff?.specialization ?? "Подберём свободного мастера"}
        />
        <DetailRow
          href={bookingHref("/book/time", state)}
          icon={<IconCircle><CalendarIcon /></IconCircle>}
          title={formatDayLong(date)}
          subtitle={`${localTime(startsAt, salon.timezone)} — ${localTime(endsAt, salon.timezone)}`}
          subtitleStrong
        />
      </section>

      <section className="py-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            Услуги <span className="text-base font-normal text-muted">{formatDuration(duration)}</span>
          </h2>
          <Link href={bookingHref("/book/services", state)} aria-label="Изменить услуги" className="text-ink/70">
            <PencilIcon />
          </Link>
        </div>
        <ul className="flex flex-col gap-3 border-b border-line pb-4">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-4">
              <div>
                <div>{l.title}</div>
                <div className="text-sm text-muted">{formatDuration(l.durationMin)}</div>
              </div>
              <div className="shrink-0 font-medium">{formatPrice(l.priceMin, l.priceMax, salon.currency)}</div>
            </li>
          ))}
        </ul>
        <div className="flex justify-between pt-4">
          <span>Итого</span>
          <span>{total}</span>
        </div>
      </section>

      {stillFree ? (
        <ConfirmForm state={state} total={total} countryCode={salon.phoneCountryCode} salonName={salon.name} />
      ) : (
        <div className="rounded-2xl bg-chip p-4 text-center">
          <p className="mb-3">Выбранное время уже недоступно.</p>
          <Link href={bookingHref("/book/time", { ...state, at: null })} className={primaryButton}>
            Выбрать другое время
          </Link>
        </div>
      )}
    </Page>
  );
}

function IconCircle({ children }: { children: React.ReactNode }) {
  return <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-chip">{children}</div>;
}

function DetailRow(props: { href: string; icon: React.ReactNode; title: string; subtitle: string; subtitleStrong?: boolean }) {
  return (
    <div className="flex items-center gap-4">
      {props.icon}
      <div className="min-w-0 flex-1">
        <div className={props.subtitleStrong ? "text-sm text-muted" : "text-[17px]"}>{props.title}</div>
        <div className={props.subtitleStrong ? "text-[17px]" : "text-sm text-muted"}>{props.subtitle}</div>
      </div>
      <Link href={props.href} aria-label="Изменить" className="text-ink/70">
        <PencilIcon />
      </Link>
    </div>
  );
}
