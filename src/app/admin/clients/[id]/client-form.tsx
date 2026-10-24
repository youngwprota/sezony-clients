"use client";

import { useState, useTransition } from "react";
import { Field, btnPrimary, inputCls } from "@/components/form";
import { saveClientAction } from "../../actions";
import { setPersonalDiscountAction } from "../../marketing-actions";

export function ClientForm({ id, initial }: { id: number; initial: { name: string; email: string; birthday: string; comment: string; marketingConsent: boolean } }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Field label="Имя">
        <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="E-mail">
        <input className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label="Дата рождения">
        <input className={inputCls} type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} />
      </Field>
      <Field label="Заметка (видят только сотрудники)">
        <textarea className={`${inputCls} h-20 py-2`} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.marketingConsent} onChange={(e) => setF({ ...f, marketingConsent: e.target.checked })} />
        Согласен получать акции и новости
      </label>
      <div className="flex items-center gap-3">
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() => start(async () => { const r = await saveClientAction(id, f); setMsg(r.ok ? "Сохранено" : r.error); })}
        >
          Сохранить
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}

export function PersonalDiscount({ clientId, value, levelDiscount }: { clientId: number; value: number | null; levelDiscount: number }) {
  const [v, setV] = useState(value === null ? "" : String(value));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <Field label="Личная скидка, %">
        <input className={`${inputCls} w-36`} type="number" min={0} max={100} value={v} placeholder={`по уровню: ${levelDiscount}`} onChange={(e) => setV(e.target.value)} />
      </Field>
      <button
        className={btnPrimary}
        disabled={pending}
        onClick={() => start(async () => { const r = await setPersonalDiscountAction(clientId, v === "" ? null : Number(v)); setMsg(r.ok ? "Сохранено" : r.error); })}
      >
        Сохранить
      </button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
      <p className="w-full text-xs text-muted">Оставьте пустым, чтобы действовала скидка уровня.</p>
    </div>
  );
}
