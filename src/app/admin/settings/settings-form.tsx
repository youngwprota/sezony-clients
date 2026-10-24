"use client";

import { useState, useTransition } from "react";
import { Field, btnPrimary, card, inputCls } from "@/components/form";
import { changePasswordAction, saveSettingsAction } from "../actions";

type Settings = {
  name: string;
  description: string;
  address: string;
  phone: string;
  currency: string;
  phoneCountryCode: string;
  timezone: string;
  slotStepMinutes: number;
  minLeadMinutes: number;
  bookingDaysAhead: number;
};

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const text = (k: keyof Settings) => ({ value: String(s[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: e.target.value }) });
  const num = (k: keyof Settings) => ({ type: "number", value: String(s[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) }) });

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-bold">Настройки</h1>
      <section className={`${card} grid gap-3 sm:grid-cols-2`}>
        <Field label="Название салона"><input className={inputCls} {...text("name")} /></Field>
        <Field label="Подзаголовок"><input className={inputCls} {...text("description")} /></Field>
        <Field label="Адрес"><input className={inputCls} {...text("address")} /></Field>
        <Field label="Телефон салона"><input className={inputCls} {...text("phone")} /></Field>
        <Field label="Валюта"><input className={inputCls} {...text("currency")} /></Field>
        <Field label="Код страны для телефонов"><input className={inputCls} {...text("phoneCountryCode")} /></Field>
        <Field label="Часовой пояс"><input className={inputCls} {...text("timezone")} placeholder="Europe/Minsk" /></Field>
      </section>
      <section className={`${card} grid gap-3 sm:grid-cols-3`}>
        <Field label="Шаг онлайн-записи, мин"><input className={inputCls} min={5} {...num("slotStepMinutes")} /></Field>
        <Field label="Запись не позже чем за, мин"><input className={inputCls} min={0} {...num("minLeadMinutes")} /></Field>
        <Field label="Запись открыта на, дней"><input className={inputCls} min={1} {...num("bookingDaysAhead")} /></Field>
      </section>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} disabled={pending} onClick={() => start(async () => { const r = await saveSettingsAction(s); setMsg(r.ok ? "Сохранено" : r.error); })}>
          Сохранить
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>

      <section className={`${card} mt-4 grid gap-3 sm:grid-cols-3`}>
        <h2 className="text-lg font-semibold sm:col-span-3">Сменить мой пароль</h2>
        <Field label="Текущий пароль"><input type="password" className={inputCls} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="Новый пароль"><input type="password" className={inputCls} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        <div className="flex items-end gap-3">
          <button
            className={btnPrimary}
            disabled={pending}
            onClick={() => start(async () => { const r = await changePasswordAction(pw.current, pw.next); setPwMsg(r.ok ? "Пароль изменён" : r.error); if (r.ok) setPw({ current: "", next: "" }); })}
          >
            Сменить
          </button>
        </div>
        {pwMsg && <p className="text-sm text-muted sm:col-span-3">{pwMsg}</p>}
      </section>
    </div>
  );
}
