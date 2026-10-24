"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markSeenAction, setStatusAction } from "./actions";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  BOOKED: { label: "Ожидает", cls: "bg-chip text-ink" },
  CONFIRMED: { label: "Подтвердил", cls: "bg-blue-100 text-blue-800" },
  ARRIVED: { label: "Пришёл", cls: "bg-green-100 text-green-800" },
  NO_SHOW: { label: "Не пришёл", cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "Отменена", cls: "bg-chip text-muted line-through" },
};

type Card = {
  id: number;
  time: string;
  clientName: string;
  phone: string;
  services: { title: string; price: string }[];
  comment: string;
  status: string;
  isNew: boolean;
  online: boolean;
};

export function AppointmentCard({ a }: { a: Card }) {
  const [pending, start] = useTransition();
  const st = STATUS_STYLE[a.status];
  const cancelled = a.status === "CANCELLED";
  return (
    <li className={`rounded-2xl bg-white p-4 ${cancelled ? "opacity-60" : ""} ${a.isNew && !cancelled ? "ring-2 ring-ink" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">{a.time}</span>
        <div className="flex items-center gap-2">
          {a.isNew && !cancelled && <span className="rounded-full bg-ink px-2 py-0.5 text-xs text-white">Новая</span>}
          <span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{a.clientName}</div>
          <a href={`tel:${a.phone}`} className="text-sm text-blue-700">
            {a.phone}
          </a>
        </div>
        <a href={`tel:${a.phone}`} className="flex size-10 items-center justify-center rounded-full bg-chip" aria-label="Позвонить">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
          </svg>
        </a>
      </div>
      <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3 text-sm">
        {a.services.map((s, i) => (
          <li key={i} className="flex justify-between gap-3">
            <span>{s.title}</span>
            <span className="shrink-0 text-muted">{s.price}</span>
          </li>
        ))}
      </ul>
      {a.comment && <p className="mt-2 rounded-xl bg-chip p-2 text-sm">💬 {a.comment}</p>}
      {a.online && <p className="mt-2 text-xs text-muted">Онлайн-запись</p>}
      {!cancelled && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            disabled={pending || a.status === "ARRIVED"}
            onClick={() => start(() => setStatusAction(a.id, "ARRIVED"))}
            className="h-10 rounded-xl bg-chip text-sm disabled:opacity-40"
          >
            Клиент пришёл
          </button>
          <button
            disabled={pending || a.status === "NO_SHOW"}
            onClick={() => start(() => setStatusAction(a.id, "NO_SHOW"))}
            className="h-10 rounded-xl bg-chip text-sm disabled:opacity-40"
          >
            Не пришёл
          </button>
        </div>
      )}
    </li>
  );
}

/** Обновляет расписание раз в минуту и при возврате в приложение. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);
  return null;
}

/** Отмечает записи просмотренными через несколько секунд после показа. */
export function MarkSeen({ ids }: { ids: number[] }) {
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    const t = setTimeout(() => markSeenAction(key.split(",").map(Number)), 4000);
    return () => clearTimeout(t);
  }, [key]);
  return null;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function NotificationsPanel({
  vapidKey,
  telegramLink,
  telegramLinked,
  viberLink,
  viberLinked,
}: {
  vapidKey: string;
  telegramLink: string | null;
  telegramLinked: boolean;
  viberLink: string | null;
  viberLinked: boolean;
}) {
  const [push, setPush] = useState<"unsupported" | "off" | "on" | "denied" | "loading">("loading");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) return setPush("unsupported");
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      if (Notification.permission === "denied") return setPush("denied");
      setPush((await reg.pushManager.getSubscription()) ? "on" : "off");
    });
  }, [vapidKey]);

  const enable = async () => {
    setPush("loading");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setPush("denied");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
    await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub) });
    setPush("on");
  };

  return (
    <section className="mx-4 mt-6 rounded-2xl bg-white p-4">
      <h2 className="font-semibold">Уведомления о новых записях</h2>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        {push === "off" && (
          <button onClick={enable} className="h-11 rounded-xl bg-ink text-white">
            Включить уведомления на этом телефоне
          </button>
        )}
        {push === "on" && <p>✅ Уведомления на этом устройстве включены</p>}
        {push === "denied" && <p className="text-muted">Уведомления запрещены в настройках браузера</p>}
        {push === "unsupported" && (
          <p className="text-muted">Чтобы получать push-уведомления, добавьте приложение на экран «Домой» (Поделиться → На экран «Домой»).</p>
        )}
        {viberLink &&
          (viberLinked ? (
            <p>✅ Viber подключён</p>
          ) : (
            <a href={viberLink} className="flex h-11 items-center justify-center rounded-xl bg-[#7360f2] text-white">
              Подключить Viber
            </a>
          ))}
        {telegramLink &&
          (telegramLinked ? (
            <p>✅ Telegram подключён</p>
          ) : (
            <a href={telegramLink} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center rounded-xl bg-[#2aabee] text-white">
              Подключить Telegram
            </a>
          ))}
      </div>
    </section>
  );
}
