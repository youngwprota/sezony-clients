"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/lib/time";
import { formatPrice } from "@/lib/money";
import { Sheet } from "@/components/sheet";
import { Field, btnPrimary, btnSecondary, card, inputCls } from "@/components/form";
import { deleteCategoryAction, moveCategoryAction, saveCategoryAction, saveServiceAction } from "../actions";

type Service = {
  id?: number;
  categoryId: number;
  title: string;
  description: string;
  priceMin: number;
  priceMax: number;
  durationMin: number;
  online: boolean;
  active: boolean;
  staffIds: number[];
};
type Category = { id: number; title: string; services: Service[] };
type Staff = { id: number; name: string; specialization: string };

export function ServicesAdmin({ categories, staff, currency }: { categories: Category[]; staff: Staff[]; currency: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Service | null>(null);
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();
  const q = query.trim().toLowerCase();

  const renameCategory = (c: Category | null) => {
    const title = prompt(c ? "Название категории" : "Новая категория", c?.title ?? "");
    if (title === null) return;
    start(async () => {
      const res = await saveCategoryAction(c?.id ?? null, title);
      if (!res.ok) alert(res.error);
      router.refresh();
    });
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-bold">Услуги</h1>
        <input className={`${inputCls} w-56`} placeholder="Поиск" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className={btnSecondary} onClick={() => renameCategory(null)}>+ Категория</button>
        <button
          className={btnPrimary}
          disabled={!categories.length}
          onClick={() =>
            setEditing({ categoryId: categories[0].id, title: "", description: "", priceMin: 0, priceMax: 0, durationMin: 60, online: true, active: true, staffIds: [] })
          }
        >
          + Услуга
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {categories.map((c, i) => {
          const list = c.services.filter((s) => !q || s.title.toLowerCase().includes(q));
          if (q && !list.length) return null;
          return (
            <section key={c.id} className={card}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="mr-auto text-lg font-semibold">{c.title}</h2>
                <button className="px-2 text-muted disabled:opacity-30" disabled={pending || i === 0} onClick={() => start(() => moveCategoryAction(c.id, -1))} title="Выше">↑</button>
                <button className="px-2 text-muted disabled:opacity-30" disabled={pending || i === categories.length - 1} onClick={() => start(() => moveCategoryAction(c.id, 1))} title="Ниже">↓</button>
                <button className="text-sm text-muted hover:text-ink" onClick={() => renameCategory(c)}>Переименовать</button>
                {c.services.length === 0 && (
                  <button
                    className="text-sm text-danger"
                    onClick={() => start(async () => { const r = await deleteCategoryAction(c.id); if (!r.ok) alert(r.error); router.refresh(); })}
                  >
                    Удалить
                  </button>
                )}
              </div>
              {list.length === 0 && <p className="text-sm text-muted">Нет услуг</p>}
              <ul className="divide-y divide-line">
                {list.map((s) => (
                  <li key={s.id}>
                    <button className="flex w-full items-center gap-3 py-2 text-left hover:bg-chip/50" onClick={() => setEditing(s)}>
                      <span className={`flex-1 ${s.active ? "" : "text-muted line-through"}`}>
                        {s.title}
                        {!s.online && s.active && <span className="ml-2 rounded bg-chip px-1.5 text-xs text-muted">не онлайн</span>}
                      </span>
                      <span className="w-24 text-right text-sm text-muted">{formatDuration(s.durationMin)}</span>
                      <span className="w-32 text-right text-sm">{formatPrice(s.priceMin, s.priceMax, currency)}</span>
                      <span className="w-20 text-right text-xs text-muted">{s.staffIds.length} мастер.</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <Sheet open={!!editing} onClose={() => setEditing(null)}>
        {editing && <ServiceForm key={editing.id ?? "new"} initial={editing} categories={categories} staff={staff} onDone={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}

function ServiceForm({ initial, categories, staff, onDone }: { initial: Service; categories: Category[]; staff: Staff[]; onDone: () => void }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Service>(k: K, v: Service[K]) => setS((x) => ({ ...x, [k]: v }));

  const save = () =>
    start(async () => {
      const res = await saveServiceAction(s);
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{s.id ? "Услуга" : "Новая услуга"}</h2>
      <Field label="Название">
        <input className={inputCls} value={s.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Категория">
        <select className={inputCls} value={s.categoryId} onChange={(e) => set("categoryId", Number(e.target.value))}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </Field>
      <Field label="Описание для клиентов">
        <textarea className={`${inputCls} h-24 py-2`} value={s.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Цена от">
          <input type="number" min={0} step="0.01" className={inputCls} value={s.priceMin} onChange={(e) => set("priceMin", Number(e.target.value))} />
        </Field>
        <Field label="Цена до">
          <input type="number" min={0} step="0.01" className={inputCls} value={s.priceMax} onChange={(e) => set("priceMax", Number(e.target.value))} />
        </Field>
        <Field label="Длительность, мин">
          <input type="number" min={5} step={5} className={inputCls} value={s.durationMin} onChange={(e) => set("durationMin", Number(e.target.value))} />
        </Field>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.online} onChange={(e) => set("online", e.target.checked)} /> Доступна для онлайн-записи
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={s.active} onChange={(e) => set("active", e.target.checked)} /> Активна (снимите, чтобы скрыть услугу)
      </label>
      <div>
        <div className="mb-1 flex items-center justify-between text-sm text-muted">
          <span>Кто выполняет</span>
          <button className="underline" onClick={() => set("staffIds", s.staffIds.length === staff.length ? [] : staff.map((x) => x.id))}>
            {s.staffIds.length === staff.length ? "Снять всех" : "Выбрать всех"}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {staff.map((m) => (
            <label key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-chip">
              <input
                type="checkbox"
                checked={s.staffIds.includes(m.id)}
                onChange={(e) => set("staffIds", e.target.checked ? [...s.staffIds, m.id] : s.staffIds.filter((x) => x !== m.id))}
              />
              <span className="text-sm">
                {m.name} <span className="text-muted">{m.specialization}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">Индивидуальные цены и длительность мастера задаются в карточке сотрудника.</p>
      </div>
      {error && <p className="text-danger">{error}</p>}
      <div className="flex gap-2">
        <button className={`${btnPrimary} flex-1`} disabled={pending} onClick={save}>Сохранить</button>
        <button className={btnSecondary} onClick={onDone}>Отмена</button>
      </div>
    </div>
  );
}
