"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bookingHref, nextStep, type BookingState } from "@/lib/booking-state";
import type { Slot } from "@/lib/booking";
import { Avatar, BottomBar, InfoIcon, UsersIcon, primaryButton } from "@/components/ui";
import { Sheet } from "@/components/sheet";

export type StaffCard = {
  id: number;
  name: string;
  specialization: string;
  bio: string;
  avatarUrl: string | null;
  available: boolean;
  price: string | null;
  nearestLabel: string | null;
  slots: Slot[];
};

export function StaffPicker({ state, cards }: { state: BookingState; cards: StaffCard[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(state.staffId);
  const [info, setInfo] = useState<StaffCard | null>(null);

  // смена мастера сбрасывает ранее выбранное время — у другого мастера оно может быть занято
  const withStaff = (staffId: number | null): BookingState => ({
    ...state,
    staffId,
    at: staffId === state.staffId ? state.at : null,
  });
  const next = withStaff(selected);
  const buttonLabel = !next.serviceIds.length ? "Выбрать услугу" : !next.at ? "Выбрать дату и время" : "Готово";

  return (
    <>
      <ul className="flex flex-col">
        <li>
          <button type="button" onClick={() => setSelected(null)} className="flex w-full items-center gap-4 py-3 text-left">
            <div className="flex size-12 items-center justify-center rounded-full bg-chip">
              <UsersIcon />
            </div>
            <span className="flex-1 text-[17px]">Любой специалист</span>
            <Radio checked={selected === null} />
          </button>
        </li>
        {cards.map((c) => (
          <li key={c.id} className={c.available ? "" : "opacity-45"}>
            <div className="flex items-center gap-4 pt-4">
              <button
                type="button"
                disabled={!c.available}
                onClick={() => setSelected(c.id)}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <Avatar name={c.name} url={c.avatarUrl} />
                <div className="min-w-0">
                  <div className="text-[17px]">{c.name}</div>
                  <div className="truncate text-sm text-muted">{c.specialization}</div>
                  {c.price && <div className="mt-0.5 text-sm font-medium">{c.price}</div>}
                </div>
              </button>
              <button type="button" aria-label={`О мастере ${c.name}`} onClick={() => setInfo(c)} className="p-1 text-ink/80">
                <InfoIcon />
              </button>
              <button type="button" disabled={!c.available} onClick={() => setSelected(c.id)} aria-label="Выбрать">
                <Radio checked={selected === c.id} />
              </button>
            </div>
            {c.available && c.nearestLabel && (
              <div className="pl-16">
                <div className="mt-3 mb-2 text-sm text-muted">
                  Ближайшее время для записи <span className="font-medium text-ink">{c.nearestLabel}:</span>
                </div>
                <div className="no-scrollbar -mr-4 flex gap-2 overflow-x-auto pr-4">
                  {c.slots.map((s) => (
                    <button
                      key={s.startsAt}
                      type="button"
                      onClick={() => router.push(nextStep({ ...state, staffId: c.id, at: s.startsAt }))}
                      className="h-10 shrink-0 rounded-xl bg-chip px-4 text-[15px] active:bg-ink active:text-white"
                    >
                      {s.time}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => router.push(bookingHref("/book/time", { ...state, staffId: c.id, at: null }))}
                    className="h-10 shrink-0 rounded-xl bg-chip px-4 text-[15px]"
                  >
                    Другое время
                  </button>
                </div>
              </div>
            )}
            {c.available && !c.nearestLabel && <div className="mt-2 pl-16 text-sm text-muted">Нет свободного времени в ближайшие 2 недели</div>}
          </li>
        ))}
      </ul>

      <BottomBar>
        <button type="button" className={primaryButton} onClick={() => router.push(nextStep(next))}>
          {buttonLabel}
        </button>
      </BottomBar>

      <Sheet open={!!info} onClose={() => setInfo(null)}>
        {info && (
          <div className="flex flex-col items-center text-center">
            <Avatar name={info.name} url={info.avatarUrl} size={96} />
            <h2 className="mt-3 text-xl font-semibold">{info.name}</h2>
            <p className="text-muted">{info.specialization}</p>
            {info.bio && <p className="mt-4 text-left whitespace-pre-line">{info.bio}</p>}
            {info.available && (
              <button
                type="button"
                className={`${primaryButton} mt-6`}
                onClick={() => {
                  setSelected(info.id);
                  setInfo(null);
                }}
              >
                Выбрать
              </button>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}

export function Radio({ checked }: { checked: boolean }) {
  return (
    <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-ink" : "border-line"}`}>
      {checked && <span className="size-3 rounded-full bg-ink" />}
    </span>
  );
}
