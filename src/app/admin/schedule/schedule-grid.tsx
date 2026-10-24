"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { WEEKDAYS_SHORT, addDays, formatDayLong, weekdayIndex } from "@/lib/time";
import { Sheet } from "@/components/sheet";
import { Field, btnPrimary, btnSecondary, inputCls } from "@/components/form";
import { fillScheduleAction, setShiftAction } from "../actions";

type Shift = { staffId: number; date: string; start: string; end: string };
type Staff = { id: number; name: string; specialization: string };

export function ScheduleGrid({ from, today, days, staff, shifts }: { from: string; today: string; days: string[]; staff: Staff[]; shifts: Shift[] }) {
  const router = useRouter();
  const [cell, setCell] = useState<{ staff: Staff; date: string } | null>(null);
  const [template, setTemplate] = useState(false);
  const byKey = new Map<string, Shift[]>();
  for (const s of shifts) byKey.set(`${s.staffId}|${s.date}`, [...(byKey.get(`${s.staffId}|${s.date}`) ?? []), s]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">График работы</h1>
        <button className={btnSecondary} onClick={() => router.push(`/admin/schedule?from=${addDays(from, -7)}`)}>‹ Неделя</button>
        <button className={btnSecondary} onClick={() => router.push(`/admin/schedule`)}>Текущая</button>
        <button className={btnSecondary} onClick={() => router.push(`/admin/schedule?from=${addDays(from, 7)}`)}>Неделя ›</button>
        <button className={btnPrimary} onClick={() => setTemplate(true)}>Заполнить по шаблону</button>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-40 bg-white p-2 text-left font-medium">Сотрудник</th>
              {days.map((d) => (
                <th key={d} className={`min-w-16 p-2 text-center font-normal ${d === today ? "text-ink" : "text-muted"} ${weekdayIndex(d) === 0 ? "border-l-2 border-line" : ""}`}>
                  <div className="text-xs">{WEEKDAYS_SHORT[weekdayIndex(d)]}</div>
                  <div className={`text-base ${d === today ? "font-bold" : ""}`}>{Number(d.slice(8))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="sticky left-0 z-10 bg-white p-2">
                  <div className="font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted">{s.specialization}</div>
                </td>
                {days.map((d) => {
                  const list = byKey.get(`${s.id}|${d}`) ?? [];
                  return (
                    <td key={d} className={`p-1 ${weekdayIndex(d) === 0 ? "border-l-2 border-line" : ""}`}>
                      <button
                        onClick={() => setCell({ staff: s, date: d })}
                        className={`h-12 w-full rounded-lg text-xs leading-tight ${list.length ? "bg-green-50 text-green-900 hover:bg-green-100" : "text-muted hover:bg-chip"} ${d < today ? "opacity-50" : ""}`}
                      >
                        {list.length ? list.map((x) => <div key={x.start}>{x.start}<br />{x.end}</div>) : "—"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!cell} onClose={() => setCell(null)}>
        {cell && <ShiftForm key={`${cell.staff.id}|${cell.date}`} {...cell} current={byKey.get(`${cell.staff.id}|${cell.date}`)?.[0]} onDone={() => setCell(null)} />}
      </Sheet>
      <Sheet open={template} onClose={() => setTemplate(false)}>
        {template && <TemplateForm staff={staff} from={from} onDone={() => setTemplate(false)} />}
      </Sheet>
    </div>
  );
}

function ShiftForm({ staff, date, current, onDone }: { staff: Staff; date: string; current?: Shift; onDone: () => void }) {
  const router = useRouter();
  const [start, setStart] = useState(current?.start ?? "09:00");
  const [end, setEnd] = useState(current?.end ?? "21:00");
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const save = (off: boolean) =>
    run(async () => {
      const res = await setShiftAction(staff.id, date, off ? null : start, off ? null : end);
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{staff.name}</h2>
      <p className="text-muted">{formatDayLong(date)}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Начало">
          <input type="time" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Конец">
          <input type="time" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted">Записи, которые уже стоят на этот день, не удаляются.</p>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className={`${btnPrimary} flex-1`} disabled={pending} onClick={() => save(false)}>Рабочий день</button>
        <button className={btnSecondary} disabled={pending} onClick={() => save(true)}>Выходной</button>
      </div>
    </div>
  );
}

function TemplateForm({ staff, from, onDone }: { staff: Staff[]; from: string; onDone: () => void }) {
  const router = useRouter();
  const [t, setT] = useState({
    staffIds: [] as number[],
    from,
    to: addDays(from, 27),
    mode: "week" as "week" | "cycle",
    weekdays: [true, true, true, true, true, true, false],
    workDays: 2,
    offDays: 2,
    start: "09:00",
    end: "21:00",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, run] = useTransition();
  const save = () =>
    run(async () => {
      const res = await fillScheduleAction(t);
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">Заполнить график</h2>
      <div>
        <div className="mb-1 flex justify-between text-sm text-muted">
          <span>Сотрудники</span>
          <button className="underline" onClick={() => setT({ ...t, staffIds: t.staffIds.length === staff.length ? [] : staff.map((s) => s.id) })}>
            {t.staffIds.length === staff.length ? "Снять всех" : "Выбрать всех"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {staff.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-chip">
              <input
                type="checkbox"
                checked={t.staffIds.includes(s.id)}
                onChange={(e) => setT({ ...t, staffIds: e.target.checked ? [...t.staffIds, s.id] : t.staffIds.filter((x) => x !== s.id) })}
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="С">
          <input type="date" className={inputCls} value={t.from} onChange={(e) => setT({ ...t, from: e.target.value })} />
        </Field>
        <Field label="По">
          <input type="date" className={inputCls} value={t.to} onChange={(e) => setT({ ...t, to: e.target.value })} />
        </Field>
      </div>
      <div className="flex gap-2">
        <button className={`${t.mode === "week" ? btnPrimary : btnSecondary} flex-1`} onClick={() => setT({ ...t, mode: "week" })}>По дням недели</button>
        <button className={`${t.mode === "cycle" ? btnPrimary : btnSecondary} flex-1`} onClick={() => setT({ ...t, mode: "cycle" })}>Сменный (2/2)</button>
      </div>
      {t.mode === "week" ? (
        <div className="flex gap-1">
          {WEEKDAYS_SHORT.map((w, i) => (
            <button
              key={w}
              onClick={() => setT({ ...t, weekdays: t.weekdays.map((v, j) => (j === i ? !v : v)) })}
              className={`h-10 flex-1 rounded-xl ${t.weekdays[i] ? "bg-ink text-white" : "bg-chip"}`}
            >
              {w}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Рабочих дней подряд">
            <input type="number" min={1} max={14} className={inputCls} value={t.workDays} onChange={(e) => setT({ ...t, workDays: Number(e.target.value) })} />
          </Field>
          <Field label="Выходных подряд">
            <input type="number" min={0} max={14} className={inputCls} value={t.offDays} onChange={(e) => setT({ ...t, offDays: Number(e.target.value) })} />
          </Field>
          <p className="col-span-2 text-xs text-muted">Первый рабочий день цикла — дата «С».</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Начало смены">
          <input type="time" className={inputCls} value={t.start} onChange={(e) => setT({ ...t, start: e.target.value })} />
        </Field>
        <Field label="Конец смены">
          <input type="time" className={inputCls} value={t.end} onChange={(e) => setT({ ...t, end: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs text-muted">Смены выбранных сотрудников за период будут заменены. Записи клиентов не затрагиваются.</p>
      {error && <p className="text-danger">{error}</p>}
      <button className={btnPrimary} disabled={pending} onClick={save}>Заполнить</button>
    </div>
  );
}
