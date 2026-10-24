"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, formatDayLong, formatDuration, minutesToHHmm } from "@/lib/time";
import { formatPrice } from "@/lib/money";
import { Sheet } from "@/components/sheet";
import { Field, btnPrimary, btnSecondary, inputCls } from "@/components/form";
import {
  createAppointmentAction,
  searchClientsAction,
  setAppointmentStatusAction,
  staffServicesAction,
  updateAppointmentAction,
} from "./actions";

export type JournalStaff = { id: number; name: string; specialization: string; shifts: { start: number; end: number }[] };
export type JournalAppointment = {
  id: number;
  staffId: number;
  startMin: number;
  endMin: number;
  time: string;
  durationMin: number;
  clientId: number;
  clientName: string;
  /** «Постоянный · −5%» */
  loyalty: string | null;
  phone: string;
  services: string[];
  priceMin: number;
  priceMax: number;
  status: "BOOKED" | "CONFIRMED" | "ARRIVED" | "NO_SHOW" | "CANCELLED";
  comment: string;
  source: "ONLINE" | "ADMIN";
};

const STEP = 15;
const ROW_H = 16; // px на 15 минут
const COL_W = 180;

export const STATUS = {
  BOOKED: { label: "Ожидание", cls: "bg-amber-50 border-amber-400" },
  CONFIRMED: { label: "Подтвердил", cls: "bg-indigo-50 border-indigo-400" },
  ARRIVED: { label: "Пришёл", cls: "bg-green-50 border-green-500" },
  NO_SHOW: { label: "Не пришёл", cls: "bg-red-50 border-red-400" },
  CANCELLED: { label: "Отменена", cls: "bg-chip border-line" },
} as const;

type Props = {
  date: string;
  today: string;
  showAll: boolean;
  columns: JournalStaff[];
  allStaff: { id: number; name: string }[];
  items: JournalAppointment[];
  dayStart: number;
  dayEnd: number;
  currency: string;
  nowMin: number | null;
};

export function Journal(p: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState<{ staffId: number; time: string } | null>(null);
  const [editingId, setEditing] = useState<number | null>(null);
  // берём запись из свежих данных, чтобы статус обновлялся после router.refresh()
  const editing = p.items.find((i) => i.id === editingId) ?? null;
  const go = (date: string, all = p.showAll) => router.push(`/admin?date=${date}${all ? "&all=1" : ""}`);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);

  const rows = (p.dayEnd - p.dayStart) / STEP;
  const active = p.items.filter((i) => i.status !== "CANCELLED");
  const cancelled = p.items.filter((i) => i.status === "CANCELLED");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className={btnSecondary} onClick={() => go(addDays(p.date, -1))} aria-label="Предыдущий день">‹</button>
        <button className={btnSecondary} onClick={() => go(p.today)}>Сегодня</button>
        <button className={btnSecondary} onClick={() => go(addDays(p.date, 1))} aria-label="Следующий день">›</button>
        <input type="date" value={p.date} onChange={(e) => e.target.value && go(e.target.value)} className="h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-ink" />
        <h1 className="ml-1 text-xl font-bold">{formatDayLong(p.date)}</h1>
        <span className="text-muted">· {active.length} зап.</span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={p.showAll} onChange={(e) => go(p.date, e.target.checked)} />
          Показать всех сотрудников
        </label>
      </div>

      {p.columns.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-muted">
          В этот день никто не работает.{" "}
          <button className="underline" onClick={() => go(p.date, true)}>Показать всех сотрудников</button>
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl bg-white" style={{ maxHeight: "calc(100dvh - 170px)" }}>
          <div className="relative" style={{ width: 56 + p.columns.length * COL_W }}>
            {/* шапка с мастерами */}
            <div className="sticky top-0 z-20 flex border-b border-line bg-white">
              <div className="sticky left-0 z-10 w-14 shrink-0 bg-white" />
              {p.columns.map((c) => (
                <div key={c.id} className="shrink-0 border-l border-line px-2 py-2" style={{ width: COL_W }}>
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="truncate text-xs text-muted">
                    {c.shifts.length ? c.shifts.map((s) => `${minutesToHHmm(s.start)}–${minutesToHHmm(s.end)}`).join(", ") : "выходной"}
                  </div>
                </div>
              ))}
            </div>

            <div className="relative flex">
              {/* шкала времени */}
              <div className="sticky left-0 z-10 w-14 shrink-0 bg-white">
                {Array.from({ length: rows }, (_, r) => {
                  const m = p.dayStart + r * STEP;
                  return (
                    <div key={r} className="relative text-right text-xs text-muted" style={{ height: ROW_H }}>
                      {m % 60 === 0 && <span className="absolute top-0.5 right-2">{minutesToHHmm(m)}</span>}
                    </div>
                  );
                })}
              </div>

              {p.columns.map((c) => (
                <div key={c.id} className="relative shrink-0 border-l border-line" style={{ width: COL_W, height: rows * ROW_H }}>
                  {Array.from({ length: rows }, (_, r) => {
                    const m = p.dayStart + r * STEP;
                    const working = c.shifts.some((s) => m >= s.start && m < s.end);
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCreating({ staffId: c.id, time: minutesToHHmm(m) })}
                        aria-label={`Записать к ${c.name} на ${minutesToHHmm(m)}`}
                        className={`group block w-full text-left text-[11px] ${m % 60 === 0 ? "border-t border-line" : ""} ${
                          working ? "hover:bg-chip" : "bg-[repeating-linear-gradient(135deg,#f7f7f8,#f7f7f8_6px,#efeff1_6px,#efeff1_12px)] hover:brightness-95"
                        }`}
                        style={{ height: ROW_H }}
                      >
                        <span className="hidden pl-1 text-muted group-hover:inline">{minutesToHHmm(m)}</span>
                      </button>
                    );
                  })}
                  {active
                    .filter((a) => a.staffId === c.id)
                    .map((a) => {
                      const top = ((Math.max(a.startMin, p.dayStart) - p.dayStart) / STEP) * ROW_H;
                      const height = Math.max(((a.endMin - Math.max(a.startMin, p.dayStart)) / STEP) * ROW_H - 2, ROW_H);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setEditing(a.id)}
                          className={`absolute right-1 left-1 overflow-hidden rounded-lg border-l-4 px-2 py-1 text-left text-xs shadow-sm ${STATUS[a.status].cls}`}
                          style={{ top: top + 1, height }}
                        >
                          <div className="font-semibold">
                            {a.time}–{minutesToHHmm(a.endMin % (24 * 60))} {a.source === "ONLINE" && <span title="Онлайн-запись">🌐</span>}
                          </div>
                          <div className="truncate">
                            {a.clientName}
                            {a.loyalty && <span title={a.loyalty}> ★</span>}
                          </div>
                          <div className="truncate text-muted">{a.services.join(", ")}</div>
                        </button>
                      );
                    })}
                </div>
              ))}

              {p.nowMin !== null && p.nowMin >= p.dayStart && p.nowMin <= p.dayEnd && (
                <div
                  className="pointer-events-none absolute right-0 left-14 z-10 border-t-2 border-danger"
                  style={{ top: ((p.nowMin - p.dayStart) / STEP) * ROW_H }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {cancelled.length > 0 && (
        <details className="mt-4 rounded-2xl bg-white p-4">
          <summary className="cursor-pointer text-muted">Отменённые записи ({cancelled.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {cancelled.map((a) => (
              <li key={a.id}>
                <button className="text-left hover:underline" onClick={() => setEditing(a.id)}>
                  {a.time} · {p.allStaff.find((s) => s.id === a.staffId)?.name} · {a.clientName} · {a.services.join(", ")}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Sheet open={!!creating} onClose={() => setCreating(null)}>
        {creating && <CreateForm {...creating} date={p.date} staff={p.allStaff} currency={p.currency} onDone={() => setCreating(null)} />}
      </Sheet>
      <Sheet open={!!editing} onClose={() => setEditing(null)}>
        {editing && <EditForm key={editing.id} a={editing} date={p.date} staff={p.allStaff} currency={p.currency} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

type StaffService = Awaited<ReturnType<typeof staffServicesAction>>[number];

function CreateForm(props: { staffId: number; time: string; date: string; staff: { id: number; name: string }[]; currency: string; onDone: () => void }) {
  const router = useRouter();
  const [staffId, setStaffId] = useState(props.staffId);
  const [time, setTime] = useState(props.time);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [suggest, setSuggest] = useState<{ id: number; name: string; phone: string }[]>([]);
  const [services, setServices] = useState<StaffService[]>([]);
  const [chosen, setChosen] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [duration, setDuration] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    staffServicesAction(staffId).then(setServices);
    setChosen([]);
  }, [staffId]);

  useEffect(() => {
    const q = phone.length >= 3 ? phone : name;
    if (q.trim().length < 2) return setSuggest([]);
    const t = setTimeout(() => searchClientsAction(q).then(setSuggest), 250);
    return () => clearTimeout(t);
  }, [phone, name]);

  const picked = chosen.map((id) => services.find((s) => s.id === id)!).filter(Boolean);
  const autoDuration = picked.reduce((a, s) => a + s.durationMin, 0);
  const total = picked.reduce((a, s) => ({ min: a.min + s.priceMin, max: a.max + s.priceMax }), { min: 0, max: 0 });
  const visible = services.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()));

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createAppointmentAction({
        staffId,
        date: props.date,
        time,
        serviceIds: chosen,
        durationMin: duration ?? autoDuration,
        clientName: name,
        clientPhone: phone,
        comment,
      });
      if (!res.ok) return setError(res.error);
      router.refresh();
      props.onDone();
    });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">Новая запись · {formatDayLong(props.date)}</h2>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Сотрудник">
          <select className={inputCls} value={staffId} onChange={(e) => setStaffId(Number(e.target.value))}>
            {props.staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Время">
          <input type="time" step={300} className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div className="relative grid grid-cols-2 gap-3">
        <Field label="Телефон клиента">
          <input className={inputCls} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+375 29 …" />
        </Field>
        <Field label="Имя клиента">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {suggest.length > 0 && (
          <ul className="absolute top-full right-0 left-0 z-10 mt-1 rounded-xl border border-line bg-white shadow-lg">
            {suggest.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-chip"
                  onClick={() => {
                    setPhone(c.phone);
                    setName(c.name);
                    setSuggest([]);
                  }}
                >
                  {c.name} <span className="text-muted">{c.phone}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Field label={`Услуги${picked.length ? ` · ${formatDuration(autoDuration)} · ${formatPrice(total.min, total.max, props.currency)}` : ""}`}>
        <input className={inputCls} placeholder="Поиск услуги" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </Field>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-line">
        {visible.length === 0 && <li className="p-3 text-sm text-muted">У сотрудника нет таких услуг</li>}
        {visible.map((s) => (
          <li key={s.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-chip">
              <input
                type="checkbox"
                checked={chosen.includes(s.id)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, s.id] : c.filter((x) => x !== s.id)))}
              />
              <span className="flex-1 text-sm">{s.title}</span>
              <span className="text-xs text-muted">{formatDuration(s.durationMin)} · {formatPrice(s.priceMin, s.priceMax, props.currency)}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Длительность, мин">
          <input type="number" min={5} step={5} className={inputCls} value={duration ?? autoDuration} onChange={(e) => setDuration(Number(e.target.value))} />
        </Field>
        <Field label="Комментарий">
          <input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className={`${btnPrimary} flex-1`} disabled={pending} onClick={submit}>
          {pending ? "Сохраняем…" : "Создать запись"}
        </button>
        <button className={btnSecondary} onClick={props.onDone}>Отмена</button>
      </div>
    </div>
  );
}

function EditForm({ a, date, staff, currency, onDone }: { a: JournalAppointment; date: string; staff: { id: number; name: string }[]; currency: string; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ staffId: a.staffId, date, time: a.time, durationMin: a.durationMin, comment: a.comment });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = useMemo(
    () => form.staffId !== a.staffId || form.date !== date || form.time !== a.time || form.durationMin !== a.durationMin || form.comment !== a.comment,
    [form, a, date],
  );

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, close = false) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "Ошибка");
      router.refresh();
      if (close) onDone();
    });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-bold">
          <Link href={`/admin/clients/${a.clientId}`} className="hover:underline">{a.clientName}</Link>
        </h2>
        <a href={`tel:${a.phone}`} className="text-blue-700">{a.phone}</a>
        {a.loyalty && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-sm text-indigo-900">{a.loyalty}</span>}
        {a.source === "ONLINE" && <span className="ml-2 text-sm text-muted">· онлайн-запись</span>}
      </div>
      <div className="rounded-xl bg-chip p-3 text-sm">
        {a.services.join(", ")}
        <div className="mt-1 font-medium">{formatPrice(a.priceMin, a.priceMax, currency)}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["BOOKED", "CONFIRMED", "ARRIVED", "NO_SHOW"] as const).map((s) => (
          <button
            key={s}
            disabled={pending}
            onClick={() => run(() => setAppointmentStatusAction(a.id, s))}
            className={`h-9 rounded-xl border-l-4 px-3 text-sm ${STATUS[s].cls} ${a.status === s ? "ring-2 ring-ink" : ""}`}
          >
            {STATUS[s].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Сотрудник">
          <select className={inputCls} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: Number(e.target.value) })}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Дата">
          <input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Время">
          <input type="time" step={300} className={inputCls} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </Field>
        <Field label="Длительность, мин">
          <input type="number" min={5} step={5} className={inputCls} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="Комментарий">
        <textarea className={`${inputCls} h-20 py-2`} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
      </Field>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {dirty && (
          <button className={`${btnPrimary} flex-1`} disabled={pending} onClick={() => run(() => updateAppointmentAction({ id: a.id, ...form }), true)}>
            Сохранить
          </button>
        )}
        {a.status === "CANCELLED" ? (
          <button className={btnSecondary} disabled={pending} onClick={() => run(() => setAppointmentStatusAction(a.id, "BOOKED"), true)}>
            Восстановить запись
          </button>
        ) : (
          <button
            className={`${btnSecondary} text-danger`}
            disabled={pending}
            onClick={() => confirm("Отменить запись?") && run(() => setAppointmentStatusAction(a.id, "CANCELLED"), true)}
          >
            Отменить запись
          </button>
        )}
        <button className={btnSecondary} onClick={onDone}>Закрыть</button>
      </div>
    </div>
  );
}
