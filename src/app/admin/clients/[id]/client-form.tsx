"use client";

import { useState, useTransition } from "react";
import { Field, btnPrimary, inputCls } from "@/components/form";
import { saveClientAction } from "../../actions";

export function ClientForm({ id, initial }: { id: number; initial: { name: string; email: string; comment: string } }) {
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
      <Field label="Заметка (видят только сотрудники)">
        <textarea className={`${inputCls} h-20 py-2`} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
      </Field>
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
