import Link from "next/link";
import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { bookingHref, parseBookingState } from "@/lib/booking-state";
import { formatDayLong, localDate, localTime } from "@/lib/time";
import { Avatar, BottomBar, CalendarIcon, ChevronRight, ListIcon, Page, PoweredBy, UsersIcon, primaryButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BookingMenu({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const state = parseBookingState(await searchParams);
  const salon = await getSalon();
  const [staff, services] = await Promise.all([
    state.staffId ? db.staff.findUnique({ where: { id: state.staffId } }) : null,
    state.serviceIds.length ? db.service.findMany({ where: { id: { in: state.serviceIds } } }) : [],
  ]);

  const at = state.at ? new Date(state.at) : null;
  const ready = services.length > 0 && at;

  return (
    <Page>
      <header className="pt-6 pb-4">
        <h1 className="text-[26px] font-bold">{salon.name}</h1>
        {salon.description && <p className="mt-1 text-muted">{salon.description}</p>}
      </header>

      <nav className="flex flex-col">
        <MenuRow
          href={bookingHref("/book/staff", state)}
          icon={staff ? <Avatar name={staff.name} url={staff.avatarUrl} size={48} /> : <IconCircle><UsersIcon /></IconCircle>}
          title={staff ? staff.name : "Выбрать специалиста"}
          subtitle={staff ? staff.specialization : state.serviceIds.length || at ? "Любой специалист" : undefined}
        />
        <MenuRow
          href={bookingHref("/book/time", state)}
          icon={<IconCircle><CalendarIcon /></IconCircle>}
          title={at ? `${formatDayLong(localDate(at, salon.timezone))}` : "Выбрать дату и время"}
          subtitle={at ? localTime(at, salon.timezone) : undefined}
        />
        <MenuRow
          href={bookingHref("/book/services", state)}
          icon={<IconCircle><ListIcon /></IconCircle>}
          title={services.length ? services.map((s) => s.title).join(", ") : "Выбрать услуги"}
          subtitle={services.length > 1 ? `${services.length} услуги` : undefined}
        />
      </nav>

      <PoweredBy />
      {ready && (
        <BottomBar>
          <Link href={bookingHref("/book/confirm", state)} className={primaryButton}>
            Продолжить
          </Link>
        </BottomBar>
      )}
    </Page>
  );
}

function IconCircle({ children }: { children: React.ReactNode }) {
  return <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-chip">{children}</div>;
}

function MenuRow({ href, icon, title, subtitle }: { href: string; icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl py-2 active:bg-chip/60">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[17px]">{title}</div>
        {subtitle && <div className="text-sm text-muted">{subtitle}</div>}
      </div>
      <span className="text-ink/60">
        <ChevronRight />
      </span>
    </Link>
  );
}
