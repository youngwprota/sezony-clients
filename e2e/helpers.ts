import { expect, type Page } from "@playwright/test";

/** Ошибки в консоли и необработанные исключения страницы — тест падает, если они есть. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource.*(favicon|sw\.js)/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return errors;
}

/** Страница не прокручивается по горизонтали. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll, `ширина содержимого ${scroll} > экрана ${width}`).toBeLessThanOrEqual(width + 1);
}

export async function loginAs(page: Page, login: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("Логин").fill(login);
  await page.getByPlaceholder("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

/** Уникальный корректный белорусский мобильный номер для теста. */
let n = 0;
export function testPhone() {
  n++;
  const tail = String((Date.now() % 1_000_000) * 10 + n).padStart(7, "0").slice(-7);
  return `33 ${tail.slice(0, 3)}-${tail.slice(3, 5)}-${tail.slice(5)}`;
}
