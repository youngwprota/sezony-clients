"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { bookingQuery, nextStep, type BookingState } from "@/lib/booking-state";
import type { Slot } from "@/lib/booking";
import { MONTHS_NOM, WEEKDAYS_SHORT, addDays, weekdayIndex } from "@/lib/time";
import { BottomBar, ChevronLeft, ChevronRight, primaryButton } from "@/components/ui";

const PARTS = [
  { title: "Утро", from: "00:00", to: "12:00" },
  { title: "День", from: "12:00", to: "18:00" },
  { title: "Вечер", from: "18:00", to: "24:00" },
];

export function TimePicker({
  state,
  staffName,
  today,
  initialDate,
}: {
  state: BookingState;
  staffName: string | null;
  today: string;
  initialDate: string | null;
}) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(state.staffId);
  const [dates, setDates] = useState<string[] | null>(null);
  const [date, setDate] = useState<string | null>(initialDate);
  const [month, setMonth] = useState((initialDate ?? today).slice(0, 7));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [at, setAt] = useState<string | null>(state.at);

  const query = bookingQuery({ ...state, staffId, at: null });

  useEffect(() => {
    let cancelled = false;
    setDates(null);
    fetch(`/api/public/dates${query}`)
      .then((r) => r.json())
      .then(({ dates }: { dates: string[] }) => {
        if (cancelled) return;
        setDates(dates);
        setDate((d) => (d && dates.includes(d) ? d : (dates[0] ?? null)));
        if (dates[0] && !(initialDate && dates.includes(initialDate))) setMonth(dates[0].slice(0, 7));
      });
    return () => {
      cancelled = true;
    };
  }, [query, initialDate]);

  useEffect(() => {
    if (!date) return setSlots([]);
    let cancelled = false;
    setSlots(null);
    fetch(`/api/public/slots${query}${query ? "&" : "?"}date=${date}`)
      .then((r) => r.json())
      .then(({ slots }: { slots: Slot[] }) => !cancelled && setSlots(slots));
    return () => {
      cancelled = true;
    };
  }, [date, query]);

  const available = useMemo(() => new Set(dates ?? []), [dates]);

  return (
    <>
      {state.staffId && (
        <div className="mb-2 grid grid-cols-2 text-center text-[15px]">
          {[
            { id: state.staffId, label: staffName ?? "Мастер" },
            { id: null, label: "Все специалисты" },
          ].map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => {
                setStaffId(t.id);
                setAt(null);
              }}
              className={`border-b-2 pb-2 ${staffId === t.id ? "border-ink" : "border-line text-muted"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <Calendar month={month} setMonth={setMonth} today={today} available={available} loading={!dates} selected={date} onSelect={(d) => { setDate(d); setAt(null); }} />

      <div className="mt-4 min-h-40">
        {dates && dates.length === 0 && <p className="py-8 text-center text-muted">Нет свободного времени для записи</p>}
        {slots === null && date && <p className="py-8 text-center text-muted">Загрузка…</p>}
        {slots &&
          PARTS.map((p) => {
            const list = slots.filter((s) => s.time >= p.from && s.time < p.to);
            if (!list.length) return null;
            return (
              <section key={p.title} className="mb-4">
                <h3 className="mb-3 text-[17px] font-medium">{p.title}</h3>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {list.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => setAt(s.startsAt)}
                      className={`h-10 rounded-xl text-[15px] ${at === s.startsAt ? "bg-ink text-white" : "bg-chip"}`}
                    >
                      {s.time}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        {state.staffId && staffId === state.staffId && slots && (
          <p className="text-center text-sm text-muted">Больше свободного времени, если выбрать всех специалистов</p>
        )}
      </div>

      <BottomBar>
        <button type="button" disabled={!at} className={primaryButton} onClick={() => router.push(nextStep({ ...state, staffId, at }))}>
          Готово
        </button>
      </BottomBar>
    </>
  );
}

function Calendar({
  month,
  setMonth,
  today,
  available,
  loading,
  selected,
  onSelect,
}: {
  month: string;
  setMonth: (m: string) => void;
  today: string;
  available: Set<string>;
  loading: boolean;
  selected: string | null;
  onSelect: (d: string) => void;
}) {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayIndex(first));
  const [y, m] = month.split("-").map(Number);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days[35].slice(0, 7) === month ? 6 : 5;

  return (
    <div className="-mx-4 rounded-b-3xl px-4 pb-4 shadow-[0_8px_16px_-12px_rgba(0,0,0,0.2)]">
      <div className="flex items-center justify-between py-2">
        <span className="text-[16px]">
          {MONTHS_NOM[m - 1]} {y}
        </span>
        <div className="flex gap-1">
          <button type="button" aria-label="Предыдущий месяц" disabled={month <= today.slice(0, 7)} onClick={() => shift(-1)} className="p-1 disabled:opacity-30">
            <ChevronLeft />
          </button>
          <button type="button" aria-label="Следующий месяц" onClick={() => shift(1)} className="p-1">
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-sm text-muted">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="py-2">
            {w}
          </div>
        ))}
      </div>
      <div className={`grid grid-cols-7 gap-y-1 text-center ${loading ? "animate-pulse" : ""}`}>
        {days.slice(0, weeks * 7).map((d) => {
          const inMonth = d.slice(0, 7) === month;
          const enabled = available.has(d);
          const isSel = d === selected;
          return (
            <button
              key={d}
              type="button"
              disabled={!enabled}
              onClick={() => onSelect(d)}
              className={`mx-auto flex size-11 items-center justify-center rounded-xl text-[16px] ${
                isSel ? "bg-ink font-medium text-white" : enabled ? "font-medium" : "text-ink/25"
              } ${inMonth ? "" : "invisible"} ${d === today && !isSel ? "underline underline-offset-4" : ""}`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
