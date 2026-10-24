"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { BookingState } from "@/lib/booking-state";
import { CheckIcon, primaryButton } from "@/components/ui";
import { bookAction, type BookResult } from "./actions";

const input = "h-12 w-full rounded-xl border border-line px-3 outline-none focus:border-ink placeholder:text-muted";

export function ConfirmForm({ state, total, countryCode, salonName }: { state: BookingState; total: string; countryCode: string; salonName: string }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", comment: "", consent: false, marketingConsent: false });
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ field: string; text: string } | null>(null);
  const [done, setDone] = useState<Extract<BookResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  if (done) {
    const hasLinks = done.telegram || done.viber;
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-ok text-white">
          <CheckIcon size={32} />
        </div>
        <h2 className="mt-4 text-2xl font-bold">Вы записаны!</h2>
        <p className="mt-2 text-muted">
          {done.when}
          <br />
          Мастер: {done.staffName}. Ждём вас в салоне «{salonName}».
        </p>
        {done.notified ? (
          <p className="mt-6 rounded-2xl bg-chip p-4 text-sm">Подтверждение отправили вам в мессенджер. Там же придёт напоминание перед визитом.</p>
        ) : (
          hasLinks && (
            <div className="mt-6 w-full rounded-2xl bg-chip p-4">
              <p className="mb-3 font-medium">Получить подтверждение и напоминание о визите</p>
              <div className="flex flex-col gap-2">
                {done.viber && (
                  <a href={done.viber} className="flex h-12 items-center justify-center rounded-xl bg-[#7360f2] font-medium text-white">
                    Напомнить в Viber
                  </a>
                )}
                {done.telegram && (
                  <a href={done.telegram} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center rounded-xl bg-[#2aabee] font-medium text-white">
                    Напомнить в Telegram
                  </a>
                )}
              </div>
            </div>
          )
        )}
        <Link href="/" className={`${primaryButton} mt-8`}>
          Новая запись
        </Link>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (!form.name.trim()) return setFieldError({ field: "name", text: "Введите имя" });
    if (!form.phone.trim()) return setFieldError({ field: "phone", text: "Введите номер телефона" });
    if (!form.consent) return setError("Нужно согласие на обработку персональных данных");
    start(async () => {
      const res = await bookAction({
        staffId: state.staffId,
        serviceIds: state.serviceIds,
        startsAt: state.at!,
        ...form,
        consent: form.consent as true,
      });
      if (res.ok) setDone(res);
      else if (res.field) setFieldError({ field: res.field, text: res.error });
      else setError(res.error);
    });
  };

  return (
    <form onSubmit={submit} noValidate className="-mx-4 flex flex-col gap-4 rounded-t-3xl bg-white px-4 pt-2">
      <h2 className="text-xl font-bold">Ваши данные</h2>
      <Field label="Имя *">
        <input
          className={`${input} ${fieldError?.field === "name" ? "border-danger" : ""}`}
          placeholder="Введите имя"
          value={form.name}
          maxLength={100}
          onChange={(e) => set("name", e.target.value)}
          autoComplete="name"
        />
        {fieldError?.field === "name" && <span className="text-sm text-danger">{fieldError.text}</span>}
      </Field>
      <Field label="Телефон *">
        <div className={`flex h-12 items-center rounded-xl border focus-within:border-ink ${fieldError?.field === "phone" ? "border-danger" : "border-line"}`}>
          <span className="border-r border-line px-3">{countryCode}</span>
          <input
            className="h-full flex-1 rounded-r-xl px-3 outline-none placeholder:text-muted"
            placeholder="29 123-45-67"
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={30}
            value={form.phone}
            onChange={(e) => {
              set("phone", e.target.value);
              if (fieldError?.field === "phone") setFieldError(null);
            }}
            aria-invalid={fieldError?.field === "phone"}
          />
        </div>
        {fieldError?.field === "phone" ? (
          <span className="text-sm text-danger">{fieldError.text}</span>
        ) : (
          <span className="text-xs text-muted">Мобильный номер — код оператора и 7 цифр. Номер другой страны — с «+»</span>
        )}
      </Field>
      <Field label="E-mail">
        <input
          className={`${input} ${fieldError?.field === "email" ? "border-danger" : ""}`}
          type="email"
          placeholder="Введите e-mail"
          maxLength={254}
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          autoComplete="email"
        />
        {fieldError?.field === "email" && <span className="text-sm text-danger">{fieldError.text}</span>}
      </Field>
      <Field label="Комментарий">
        <textarea
          className={`${input} h-28 resize-none py-3`}
          placeholder="Комментарий к записи"
          value={form.comment}
          maxLength={1000}
          onChange={(e) => set("comment", e.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-3 text-sm">
        <span className="text-muted">Я даю согласие:</span>
        <Check checked={form.consent} onChange={(v) => set("consent", v)}>
          салону «{salonName}» на обработку персональных данных
        </Check>
        <Check checked={form.marketingConsent} onChange={(v) => set("marketingConsent", v)}>
          на получение сообщений об акциях и новостях салона
        </Check>
      </div>

      <div className="mt-2 flex justify-between border-t border-line pt-4">
        <span>Итого</span>
        <span>{total}</span>
      </div>
      {error && <p className="rounded-xl bg-danger/10 p-3 text-danger">{error}</p>}
      <div className="sticky bottom-0 -mx-4 bg-white px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Записываем…" : "Записаться"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border-2 ${checked ? "border-ink bg-ink text-white" : "border-line"}`}>
        {checked && <CheckIcon size={12} />}
      </span>
      <span>{children}</span>
    </label>
  );
}
