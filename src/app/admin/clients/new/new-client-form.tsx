"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, btnPrimary, inputCls } from "@/components/form";
import { createClientAction } from "../../actions";

export function NewClientForm() {
  const router = useRouter();
  const [f, setF] = useState({ name: "", phone: "", email: "", birthday: "", comment: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createClientAction(f);
      if (!res.ok) return setError(res.error);
      router.push(`/admin/clients/${res.data}`);
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Имя *">
        <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </Field>
      <Field label="Телефон *">
        <input className={inputCls} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+375 29 …" required />
      </Field>
      <Field label="E-mail">
        <input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label="Дата рождения">
        <input className={inputCls} type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} />
      </Field>
      <Field label="Заметка">
        <textarea className={`${inputCls} h-20 py-2`} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
      </Field>
      {error && <p className="text-danger">{error}</p>}
      <button className={`${btnPrimary} self-start`} disabled={pending}>Сохранить</button>
    </form>
  );
}
