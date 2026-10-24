"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Segment } from "@/lib/segment-rules";
import { renderTemplate } from "@/lib/template";
import type { SegmentPreview } from "@/lib/campaigns";
import { Field, btnPrimary, btnSecondary, card, inputCls } from "@/components/form";
import {
  cancelCampaignAction,
  deleteDraftAction,
  previewSegmentAction,
  saveCampaignAction,
  startCampaignAction,
} from "../../marketing-actions";

type Draft = { id?: number; title: string; text: string; bookButton: boolean; segment: Segment };

const EMPTY: Segment = {
  levelIds: [],
  notVisitedDays: null,
  visitedWithinDays: null,
  minVisits: null,
  staffIds: [],
  categoryIds: [],
  birthdayThisMonth: false,
  channel: "any",
};

const PRESETS: { label: string; title: string; text: string; segment: Partial<Segment> }[] = [
  {
    label: "Давно не были",
    title: "Скучаем по вам",
    text: "{имя}, давно вас не видели! Запишитесь на этой неделе — будем рады видеть вас снова в «Sезонах».",
    segment: { notVisitedDays: 60 },
  },
  {
    label: "Именинники месяца",
    title: "С днём рождения",
    text: "{имя}, в этом месяце ваш день рождения! Дарим скидку 10% на любую услугу до конца месяца.",
    segment: { birthdayThisMonth: true },
  },
  {
    label: "Постоянным клиентам",
    title: "Для постоянных клиентов",
    text: "{имя}, спасибо, что выбираете нас! Для вас действует скидка {скидка}. Будем рады видеть вас снова.",
    segment: { minVisits: 5 },
  },
];

function Chips<T extends number>({ options, value, onChange }: { options: { id: T; name: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={`rounded-lg px-2.5 py-1 text-sm ${on ? "bg-ink text-white" : "bg-chip"}`}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

const DAYS = [null, 30, 60, 90, 180];

export function CampaignEditor({
  initial,
  levels,
  staff,
  categories,
}: {
  initial: Draft;
  levels: { id: number; name: string }[];
  staff: { id: number; name: string }[];
  categories: { id: number; title: string }[];
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  // undefined — считаем, null — фильтр заполнен неверно
  const [preview, setPreview] = useState<SegmentPreview | null | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seg = d.segment;
  const setSeg = (patch: Partial<Segment>) => {
    setConfirming(false);
    setD((x) => ({ ...x, segment: { ...x.segment, ...patch } }));
  };

  const segKey = JSON.stringify(seg);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => previewSegmentAction(JSON.parse(segKey)).then((p) => !cancelled && setPreview(p)), 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [segKey]);

  const save = async () => {
    const res = await saveCampaignAction(d);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    setD((x) => ({ ...x, id: res.data }));
    return res.data!;
  };

  return (
    <div className="flex flex-col gap-4">
      {!d.id && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Шаблоны:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="rounded-lg bg-white px-3 py-1.5 hover:bg-chip"
              onClick={() => setD((x) => ({ ...x, title: p.title, text: p.text, segment: { ...EMPTY, ...p.segment } }))}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <section className={`${card} flex flex-col gap-3`}>
        <Field label="Название (видно только вам)">
          <input className={inputCls} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </Field>
        <Field label="Текст сообщения">
          <textarea className={`${inputCls} h-32 py-2`} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })} />
        </Field>
        <p className="-mt-1 text-xs text-muted">
          {"{имя}"} — имя клиента, {"{скидка}"} — его скидка по программе лояльности. Ссылка на отписку добавится автоматически.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.bookButton} onChange={(e) => setD({ ...d, bookButton: e.target.checked })} />
          Кнопка «Записаться» со ссылкой на сайт
        </label>
        {d.text && (
          <div className="rounded-xl bg-chip p-3 text-sm whitespace-pre-line">
            <div className="mb-1 text-xs text-muted">Так увидит клиентка Анна со скидкой 5%:</div>
            {renderTemplate(d.text, { name: "Анна Петрова", discount: 5 })}
          </div>
        )}
      </section>

      <section className={`${card} flex flex-col gap-3`}>
        <h2 className="font-semibold">Кому отправить</h2>
        {levels.length > 0 && (
          <Field label="Уровень лояльности">
            <Chips options={levels} value={seg.levelIds} onChange={(v) => setSeg({ levelIds: v })} />
          </Field>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Не были дольше">
            <select className={inputCls} value={seg.notVisitedDays ?? ""} onChange={(e) => setSeg({ notVisitedDays: e.target.value ? Number(e.target.value) : null })}>
              {DAYS.map((v) => (
                <option key={String(v)} value={v ?? ""}>{v ? `${v} дней` : "не важно"}</option>
              ))}
            </select>
          </Field>
          <Field label="Были за последние">
            <select className={inputCls} value={seg.visitedWithinDays ?? ""} onChange={(e) => setSeg({ visitedWithinDays: e.target.value ? Number(e.target.value) : null })}>
              {DAYS.map((v) => (
                <option key={String(v)} value={v ?? ""}>{v ? `${v} дней` : "не важно"}</option>
              ))}
            </select>
          </Field>
          <Field label="Визитов не меньше">
            <input className={inputCls} type="number" min={0} value={seg.minVisits ?? ""} onChange={(e) => setSeg({ minVisits: e.target.value === "" ? null : Number(e.target.value) })} placeholder="не важно" />
          </Field>
        </div>
        <Field label="Были у мастера">
          <Chips options={staff} value={seg.staffIds} onChange={(v) => setSeg({ staffIds: v })} />
        </Field>
        <Field label="Делали услуги из категории">
          <Chips options={categories.map((c) => ({ id: c.id, name: c.title }))} value={seg.categoryIds} onChange={(v) => setSeg({ categoryIds: v })} />
        </Field>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={seg.birthdayThisMonth} onChange={(e) => setSeg({ birthdayThisMonth: e.target.checked })} />
            День рождения в этом месяце
          </label>
          <label className="flex items-center gap-2">
            Канал:
            <select className={`${inputCls} h-9`} value={seg.channel} onChange={(e) => setSeg({ channel: e.target.value as Segment["channel"] })}>
              <option value="any">Telegram или Viber</option>
              <option value="telegram">только Telegram</option>
              <option value="viber">только Viber</option>
            </select>
          </label>
        </div>

        <div className="rounded-xl bg-[#f6f6f7] p-3 text-sm">
          {preview ? (
            <>
              <div>
                Подходят под фильтр: <b>{preview.matched}</b> · получат сообщение: <b>{preview.reachable}</b>
                {preview.reachable > 0 && (
                  <span className="text-muted"> (Telegram {preview.telegram}, Viber {preview.viber})</span>
                )}
              </div>
              {(preview.noConsent > 0 || preview.noMessenger > 0) && (
                <div className="mt-1 text-xs text-muted">
                  Не получат: без согласия на рассылки — {preview.noConsent}, без подключённого мессенджера — {preview.noMessenger}
                </div>
              )}
            </>
          ) : preview === null ? (
            <span className="text-danger">Проверьте фильтр: число визитов должно быть целым и не отрицательным</span>
          ) : (
            <span className="text-muted">Считаем получателей…</span>
          )}
        </div>
      </section>

      {error && <p className="text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span>Отправить {preview?.reachable ?? 0} клиентам? Отменить отправку будет нельзя.</span>
            <button
              className={btnPrimary}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const id = await save();
                  if (!id) return;
                  const res = await startCampaignAction(id);
                  if (!res.ok) return setError(res.error);
                  router.push(`/admin/marketing/${id}`);
                  router.refresh();
                })
              }
            >
              Да, отправить
            </button>
            <button className={btnSecondary} onClick={() => setConfirming(false)}>Нет</button>
          </>
        ) : (
          <>
            <button className={btnPrimary} disabled={pending || !preview?.reachable || !d.text.trim() || !d.title.trim()} onClick={() => setConfirming(true)}>
              Отправить
            </button>
            <button
              className={btnSecondary}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const id = await save();
                  if (id) router.push(`/admin/marketing`);
                })
              }
            >
              Сохранить черновик
            </button>
            {d.id && (
              <button
                className={`${btnSecondary} text-danger`}
                disabled={pending}
                onClick={() => start(async () => { await deleteDraftAction(d.id!); router.push("/admin/marketing"); })}
              >
                Удалить
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function CampaignProgress(p: { id: number; status: string; statusLabel: string; total: number; sent: number; failed: number; pending: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    if (p.status !== "SENDING") return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [p.status, router]);
  const done = p.total ? ((p.sent + p.failed) / p.total) * 100 : 100;
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-semibold">{p.statusLabel}</span>
        <span className="text-sm text-muted">
          доставлено {p.sent} · не доставлено {p.failed}
          {p.pending ? ` · в очереди ${p.pending}` : ""} · всего {p.total}
        </span>
      </div>
      <div className="h-2 rounded-r-[4px] bg-chip" aria-label={`Отправлено ${Math.round(done)}%`}>
        <div className="h-full rounded-r-[4px] bg-chart transition-[width]" style={{ width: `${done}%` }} />
      </div>
      {p.status === "SENDING" && (
        <button className={`${btnSecondary} self-start`} disabled={pending} onClick={() => start(async () => { await cancelCampaignAction(p.id); router.refresh(); })}>
          Остановить отправку
        </button>
      )}
    </section>
  );
}
