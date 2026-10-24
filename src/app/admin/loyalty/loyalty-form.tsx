"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, btnPrimary, btnSecondary, card, inputCls } from "@/components/form";
import { saveBirthdayGreetingAction, saveLevelsAction } from "../marketing-actions";

type Level = { name: string; minVisits: number; discountPercent: number; perks: string; clients?: number };

export function LoyaltyForm({ levels, birthday }: { levels: Level[]; birthday: { enabled: boolean; text: string } }) {
  const router = useRouter();
  const [rows, setRows] = useState<Level[]>(levels);
  const [bd, setBd] = useState(birthday);
  const [msg, setMsg] = useState<{ levels?: string; bd?: string }>({});
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Level>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-bold">Программа лояльности</h1>
      <section className={`${card} flex flex-col gap-3`}>
        <div>
          <h2 className="font-semibold">Уровни клиентов</h2>
          <p className="text-sm text-muted">
            Уровень считается автоматически по числу визитов со статусом «Пришёл». Скидку видят администратор в журнале и мастер в
            приложении, клиент — в боте по команде «Мой статус». Личная скидка в карточке клиента важнее скидки уровня.
          </p>
        </div>
        <div className="hidden grid-cols-[1fr_110px_90px_1.3fr_32px] gap-2 text-xs text-muted sm:grid">
          <span>Название</span>
          <span>От визитов</span>
          <span>Скидка, %</span>
          <span>Бонусы уровня</span>
        </div>
        {rows
          .map((r, i) => ({ r, i }))
          .sort((a, b) => a.r.minVisits - b.r.minVisits)
          .map(({ r, i }) => (
            <div key={i} className="grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_110px_90px_1.3fr_32px] sm:border-0 sm:pt-0">
              <input className={`${inputCls} col-span-2 sm:col-span-1`} value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Название уровня" />
              <input className={inputCls} type="number" min={0} value={r.minVisits} onChange={(e) => set(i, { minVisits: Number(e.target.value) })} aria-label="От визитов" />
              <input className={inputCls} type="number" min={0} max={100} value={r.discountPercent} onChange={(e) => set(i, { discountPercent: Number(e.target.value) })} aria-label="Скидка, %" />
              <input className={`${inputCls} col-span-2 sm:col-span-1`} value={r.perks} onChange={(e) => set(i, { perks: e.target.value })} placeholder="кофе в подарок, приоритетная запись…" aria-label="Бонусы" />
              <button className="text-muted hover:text-danger" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Удалить уровень">
                ✕
              </button>
              {r.clients !== undefined && <span className="col-span-2 -mt-1 text-xs text-muted sm:col-span-5">Сейчас на уровне: {r.clients}</span>}
            </div>
          ))}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={btnSecondary}
            onClick={() => setRows((r) => [...r, { name: "", minVisits: Math.max(0, ...r.map((x) => x.minVisits)) + 5, discountPercent: 0, perks: "" }])}
          >
            + Уровень
          </button>
          <button
            className={btnPrimary}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveLevelsAction(rows.map(({ clients: _, ...l }) => l));
                setMsg({ levels: res.ok ? "Сохранено" : res.error });
                if (res.ok) router.refresh();
              })
            }
          >
            Сохранить уровни
          </button>
          {msg.levels && <span className="text-sm text-muted">{msg.levels}</span>}
        </div>
      </section>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="font-semibold">Поздравление с днём рождения</h2>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={bd.enabled} onChange={(e) => setBd({ ...bd, enabled: e.target.checked })} />
          Отправлять автоматически в 11:00 в день рождения
        </label>
        <Field label="Текст ({имя} и {скидка} подставятся сами)">
          <textarea className={`${inputCls} h-24 py-2`} value={bd.text} onChange={(e) => setBd({ ...bd, text: e.target.value })} />
        </Field>
        <p className="text-xs text-muted">Получат клиенты с указанной датой рождения, согласием на рассылки и подключённым Viber или Telegram.</p>
        <div className="flex items-center gap-2">
          <button
            className={btnPrimary}
            disabled={pending}
            onClick={() => start(async () => { const r = await saveBirthdayGreetingAction(bd.enabled, bd.text); setMsg({ bd: r.ok ? "Сохранено" : r.error }); })}
          >
            Сохранить
          </button>
          {msg.bd && <span className="text-sm text-muted">{msg.bd}</span>}
        </div>
      </section>
    </div>
  );
}
