export function formatPrice(min: number, max: number, currency: string): string {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return min === max ? `${f(min)} ${currency}` : `${f(min)} – ${f(max)} ${currency}`;
}
