/** Подстановка {имя} и {скидка} в текст рассылки. */
export function renderTemplate(text: string, vars: { name: string; discount: number }): string {
  const firstName = vars.name.trim().split(/\s+/)[0] || vars.name;
  return text.replace(/\{имя\}/gi, firstName).replace(/\{скидка\}/gi, `${vars.discount}%`);
}
