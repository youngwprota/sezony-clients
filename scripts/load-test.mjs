/**
 * Нагрузочная проверка публичной части: много одновременных клиентов открывают страницы
 * записи и запрашивают свободное время. Запуск: node scripts/load-test.mjs http://localhost:3000
 */
const base = process.argv[2] ?? "http://localhost:3000";
const total = Number(process.argv[3] ?? 600);
const concurrency = Number(process.argv[4] ?? 50);

const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 27 * 3_600_000).toISOString().slice(0, 10);
const urls = [
  "/",
  "/book/staff",
  "/book/services",
  "/book/services?staff=10",
  "/book/time?services=85",
  `/api/public/dates?services=85`,
  `/api/public/dates?services=85&staff=10`,
  `/api/public/slots?date=${today}&services=85`,
  `/api/public/slots?date=${tomorrow}&services=1,2&staff=3`,
  "/book/staff?services=85",
];

const times = [];
const failures = new Map();
let next = 0;
async function worker() {
  while (next < total) {
    const url = base + urls[next++ % urls.length];
    const t = performance.now();
    try {
      const res = await fetch(url);
      await res.arrayBuffer();
      if (!res.ok) failures.set(`${res.status} ${url}`, (failures.get(`${res.status} ${url}`) ?? 0) + 1);
    } catch (e) {
      failures.set(`${e.message} ${url}`, (failures.get(`${e.message} ${url}`) ?? 0) + 1);
    }
    times.push(performance.now() - t);
  }
}
const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const secs = (performance.now() - started) / 1000;
times.sort((a, b) => a - b);
const pct = (p) => Math.round(times[Math.floor((times.length - 1) * p)]);
console.log(`запросов: ${times.length}, одновременно: ${concurrency}, за ${secs.toFixed(1)} с (${Math.round(times.length / secs)} в секунду)`);
console.log(`время ответа: медиана ${pct(0.5)} мс, 95% — до ${pct(0.95)} мс, максимум ${pct(1)} мс`);
console.log(failures.size ? `ошибки: ${JSON.stringify(Object.fromEntries(failures))}` : "ошибок нет");
process.exit(failures.size ? 1 : 0);
