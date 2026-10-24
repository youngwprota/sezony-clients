"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { nextStep, type BookingState } from "@/lib/booking-state";
import type { CatalogCategory, CatalogService } from "@/lib/booking";
import { formatDuration } from "@/lib/time";
import { formatPrice } from "@/lib/money";
import { plural } from "@/lib/text";
import { BottomBar, CheckIcon, primaryButton } from "@/components/ui";

export function ServicePicker({ state, catalog, currency }: { state: BookingState; catalog: CatalogCategory[]; currency: string }) {
  const router = useRouter();
  const allServices = useMemo(() => catalog.flatMap((c) => c.services), [catalog]);
  const [selected, setSelected] = useState<number[]>(() => state.serviceIds.filter((id) => allServices.some((s) => s.id === id)));
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<number | null>(catalog[0]?.id ?? null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const visible = catalog
    .map((c) => ({ ...c, services: q ? c.services.filter((s) => s.title.toLowerCase().includes(q)) : c.services }))
    .filter((c) => c.services.length);

  // подсветка категории, до которой доскроллили
  useEffect(() => {
    const els = catalog.map((c) => document.getElementById(`cat-${c.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveCat(Number(top.target.id.slice(4)));
      },
      { rootMargin: "-130px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [catalog, q]);

  useEffect(() => {
    chipsRef.current?.querySelector(`[data-cat="${activeCat}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCat]);

  const toggle = (id: number) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const chosen = selected.map((id) => allServices.find((s) => s.id === id)!).filter(Boolean);
  const total = chosen.reduce((a, s) => ({ min: a.min + s.priceMin, max: a.max + s.priceMax, dur: a.dur + s.durationMin }), { min: 0, max: 0, dur: 0 });
  const next: BookingState = { ...state, serviceIds: selected };

  return (
    <>
      <div className="sticky top-14 z-10 -mx-4 bg-white px-4 pb-2">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-line px-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти" className="h-full flex-1 bg-transparent outline-none placeholder:text-muted" />
        </label>
        {!q && (
          <div ref={chipsRef} className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
            {catalog.map((c) => (
              <button
                key={c.id}
                data-cat={c.id}
                type="button"
                onClick={() => document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: "smooth" })}
                className={`h-10 shrink-0 rounded-xl px-3 text-[14px] ${activeCat === c.id ? "bg-ink text-white" : "bg-chip"}`}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {visible.length === 0 && <p className="py-10 text-center text-muted">Ничего не найдено</p>}
      {visible.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-[136px]">
          <h2 className="mt-4 mb-1 text-xl font-bold">{c.title}</h2>
          <ul>
            {c.services.map((s) => (
              <ServiceRow key={s.id} s={s} currency={currency} checked={selected.includes(s.id)} onToggle={() => toggle(s.id)} />
            ))}
          </ul>
        </section>
      ))}

      <BottomBar>
        {chosen.length > 0 && (
          <div className="mb-3 flex items-baseline justify-between">
            <span>
              {chosen.length} {plural(chosen.length, "услуга", "услуги", "услуг")} <span className="text-sm text-muted">{formatDuration(total.dur)}</span>
            </span>
            <span className="font-medium">{formatPrice(total.min, total.max, currency)}</span>
          </div>
        )}
        <button type="button" disabled={!chosen.length} className={primaryButton} onClick={() => router.push(nextStep(next))}>
          {next.at ? "Готово" : "Выбрать дату и время"}
        </button>
      </BottomBar>
    </>
  );
}

function ServiceRow({ s, currency, checked, onToggle }: { s: CatalogService; currency: string; checked: boolean; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="border-b border-line last:border-0">
      <div className="flex gap-3 py-4">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <div className="text-[16px]">{s.title}</div>
          <div className={`mt-1 text-sm text-muted ${expanded ? "" : "line-clamp-1"}`}>
            {formatDuration(s.durationMin)}
            {s.description && <> · {s.description}</>}
          </div>
        </button>
        <button type="button" onClick={onToggle} aria-label={checked ? "Убрать" : "Выбрать"} className="self-start pt-1">
          <span className={`flex size-6 items-center justify-center rounded-md border-2 ${checked ? "border-ink bg-ink text-white" : "border-line"}`}>
            {checked && <CheckIcon />}
          </span>
        </button>
      </div>
      <div className="-mt-2 flex items-center justify-between pb-4">
        <span className="font-medium">{formatPrice(s.priceMin, s.priceMax, currency)}</span>
        {s.description && (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mr-9 text-sm text-muted">
            {expanded ? "свернуть" : "ещё"}
          </button>
        )}
      </div>
    </li>
  );
}
