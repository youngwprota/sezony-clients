"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/time";
import { formatPrice } from "@/lib/money";
import { Field, btnPrimary, btnSecondary, card, inputCls } from "@/components/form";
import { saveStaffAction, unlinkTelegramAction } from "../../actions";

type Assigned = { serviceId: number; priceMin: number | null; priceMax: number | null; durationMin: number | null };
type Form = {
  id?: number;
  name: string;
  specialization: string;
  bio: string;
  avatarUrl: string;
  active: boolean;
  bookable: boolean;
  login: string;
  password: string;
  services: Assigned[];
};
type Category = { id: number; title: string; services: { id: number; title: string; priceMin: number; priceMax: number; durationMin: number }[] };

export function StaffForm({ initial, categories, currency, telegramLinked }: { initial: Form; categories: Category[]; currency: string; telegramLinked: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setSaved(false);
    setF((x) => ({ ...x, [k]: v }));
  };
  const assigned = new Map(f.services.map((s) => [s.serviceId, s]));

  const toggle = (serviceId: number, on: boolean) =>
    set("services", on ? [...f.services, { serviceId, priceMin: null, priceMax: null, durationMin: null }] : f.services.filter((s) => s.serviceId !== serviceId));
  const toggleCategory = (c: Category, on: boolean) => {
    const ids = new Set(c.services.map((s) => s.id));
    const rest = f.services.filter((s) => !ids.has(s.serviceId));
    set("services", on ? [...rest, ...c.services.map((s) => assigned.get(s.id) ?? { serviceId: s.id, priceMin: null, priceMax: null, durationMin: null })] : rest);
  };
  const override = (serviceId: number, patch: Partial<Assigned>) =>
    set("services", f.services.map((s) => (s.serviceId === serviceId ? { ...s, ...patch } : s)));

  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveStaffAction(f);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      setF((x) => ({ ...x, password: "" }));
      if (!f.id && res.data) router.replace(`/admin/staff/${res.data}`);
      else router.refresh();
    });

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <div className="max-w-4xl pb-24">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin/staff" className="text-muted">← Сотрудники</Link>
        <h1 className="text-2xl font-bold">{f.id ? f.name : "Новый сотрудник"}</h1>
      </div>

      <section className={`${card} grid gap-3 sm:grid-cols-2`}>
        <Field label="Имя">
          <input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Должность / специализация">
          <input className={inputCls} value={f.specialization} onChange={(e) => set("specialization", e.target.value)} placeholder="Парикмахер-колорист" />
        </Field>
        <Field label="Ссылка на фото" className="sm:col-span-2">
          <input className={inputCls} value={f.avatarUrl} onChange={(e) => set("avatarUrl", e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="О мастере (видят клиенты)" className="sm:col-span-2">
          <textarea className={`${inputCls} h-28 py-2`} value={f.bio} onChange={(e) => set("bio", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.bookable} onChange={(e) => set("bookable", e.target.checked)} /> Доступен для онлайн-записи
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Работает в салоне
        </label>
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="mb-1 text-lg font-semibold">Приложение мастера</h2>
        <p className="mb-3 text-sm text-muted">
          Мастер входит на странице /login и видит свои записи. Оставьте логин пустым, чтобы закрыть доступ.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Логин">
            <input className={inputCls} value={f.login} onChange={(e) => set("login", e.target.value)} autoCapitalize="none" placeholder="irina" />
          </Field>
          <Field label={initial.login ? "Новый пароль (если нужно сменить)" : "Пароль"}>
            <input className={inputCls} type="text" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        {f.id && (
          <p className="mt-3 text-sm">
            Telegram: {telegramLinked ? (
              <>подключён · <button className="text-danger underline" onClick={() => start(() => unlinkTelegramAction(f.id!))}>отключить</button></>
            ) : (
              <span className="text-muted">не подключён (мастер подключает сам в приложении)</span>
            )}
          </p>
        )}
      </section>

      <section className={`${card} mt-4`}>
        <h2 className="mb-1 text-lg font-semibold">Услуги · {f.services.length}</h2>
        <p className="mb-3 text-sm text-muted">Пустые поля — базовые цена и длительность услуги.</p>
        {categories.map((c) => {
          const all = c.services.every((s) => assigned.has(s.id));
          const some = c.services.some((s) => assigned.has(s.id));
          return (
            <details key={c.id} open={some} className="border-t border-line py-2">
              <summary className="flex cursor-pointer items-center gap-2 py-1">
                <input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = some && !all; }} onChange={(e) => toggleCategory(c, e.target.checked)} onClick={(e) => e.stopPropagation()} />
                <span className="font-medium">{c.title}</span>
                <span className="text-sm text-muted">{c.services.filter((s) => assigned.has(s.id)).length}/{c.services.length}</span>
              </summary>
              <ul className="mt-1">
                {c.services.map((s) => {
                  const a = assigned.get(s.id);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 py-1 pl-6">
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <input type="checkbox" checked={!!a} onChange={(e) => toggle(s.id, e.target.checked)} />
                        <span className="text-sm">{s.title}</span>
                        <span className="text-xs text-muted">{formatDuration(s.durationMin)} · {formatPrice(s.priceMin, s.priceMax, currency)}</span>
                      </label>
                      {a && (
                        <div className="flex gap-1">
                          <input className={`${inputCls} h-8 w-20 text-sm`} type="number" placeholder={String(s.priceMin)} value={a.priceMin ?? ""} onChange={(e) => override(s.id, { priceMin: num(e.target.value) })} title="Цена от" />
                          <input className={`${inputCls} h-8 w-20 text-sm`} type="number" placeholder={String(s.priceMax)} value={a.priceMax ?? ""} onChange={(e) => override(s.id, { priceMax: num(e.target.value) })} title="Цена до" />
                          <input className={`${inputCls} h-8 w-20 text-sm`} type="number" placeholder={`${s.durationMin} м`} value={a.durationMin ?? ""} onChange={(e) => override(s.id, { durationMin: num(e.target.value) })} title="Длительность, мин" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </section>

      <div className="fixed right-0 bottom-0 left-0 z-20 border-t border-line bg-white p-3 lg:left-56">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <button className={btnPrimary} disabled={pending} onClick={save}>{pending ? "Сохраняем…" : "Сохранить"}</button>
          <Link href="/admin/staff" className={`${btnSecondary} flex items-center`}>Назад</Link>
          {error && <span className="text-danger">{error}</span>}
          {saved && !error && <span className="text-ok">Сохранено</span>}
        </div>
      </div>
    </div>
  );
}
