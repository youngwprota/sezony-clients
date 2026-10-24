/**
 * Расчёт свободного времени мастера. Чистые функции без доступа к БД —
 * всё время в миллисекундах epoch.
 */

export type Interval = { start: number; end: number };

/** Вычитает занятые интервалы из рабочих смен. */
export function freeIntervals(shifts: Interval[], busy: Interval[]): Interval[] {
  const sortedBusy = [...busy].sort((a, b) => a.start - b.start);
  const result: Interval[] = [];
  for (const shift of [...shifts].sort((a, b) => a.start - b.start)) {
    let cursor = shift.start;
    for (const b of sortedBusy) {
      if (b.end <= cursor || b.start >= shift.end) continue;
      if (b.start > cursor) result.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
      if (cursor >= shift.end) break;
    }
    if (cursor < shift.end) result.push({ start: cursor, end: shift.end });
  }
  return result;
}

/**
 * Начала окон длительностью `durationMs` внутри свободных интервалов.
 * Кандидаты — точки сетки с шагом `stepMs` от `gridOrigin` (обычно полночь
 * по местному времени), а также начало каждого свободного интервала, чтобы
 * не терять время сразу после короткой записи.
 */
export function slotStarts(
  free: Interval[],
  durationMs: number,
  stepMs: number,
  gridOrigin: number,
  notBefore: number,
): number[] {
  const out = new Set<number>();
  for (const f of free) {
    const latestStart = f.end - durationMs;
    if (latestStart < f.start) continue;
    if (f.start >= notBefore) out.add(f.start);
    const firstGrid = gridOrigin + Math.ceil((f.start - gridOrigin) / stepMs) * stepMs;
    for (let t = firstGrid; t <= latestStart; t += stepMs) {
      if (t >= notBefore) out.add(t);
    }
  }
  return [...out].sort((a, b) => a - b);
}
