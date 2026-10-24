import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, loginAs, testPhone, watchErrors } from "./helpers";

const ADMIN_PAGES = [
  "/admin",
  "/admin/services",
  "/admin/staff",
  "/admin/staff/new",
  "/admin/schedule",
  "/admin/clients",
  "/admin/clients/new",
  "/admin/clients/import",
  "/admin/analytics",
  "/admin/analytics?period=7",
  "/admin/analytics?period=next7",
  "/admin/analytics?period=мусор",
  "/admin/marketing",
  "/admin/marketing/new",
  "/admin/loyalty",
  "/admin/settings",
  "/admin?date=2026-02-31",
  "/admin/schedule?from=не-дата",
];

async function asAdmin(page: Page) {
  await loginAs(page, "admin", "admin123");
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe("вход", () => {
  test("без входа админка и приложение мастера ведут на страницу входа", async ({ page }) => {
    for (const path of ["/admin", "/admin/clients", "/master"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    }
  });

  test("неверный пароль — понятная ошибка", async ({ page }) => {
    await loginAs(page, "admin", "wrong-password");
    await expect(page.getByText("Неверный логин или пароль")).toBeVisible();
  });

  test("мастер не попадает в админку", async ({ page }) => {
    await loginAs(page, "irina", "irina123");
    await expect(page).toHaveURL(/\/master/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/master/);
  });
});

test.describe("админка", () => {
  test("все страницы открываются без ошибок и не прокручиваются вбок", async ({ page }) => {
    const errors = watchErrors(page);
    await asAdmin(page);
    for (const path of ADMIN_PAGES) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(500);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page);
    }
    expect(errors).toEqual([]);
  });

  test("несуществующие страницы — понятная русская страница", async ({ page }) => {
    await asAdmin(page);
    for (const path of ["/admin/clients/999999", "/admin/staff/999999", "/admin/marketing/999999", "/нет-такой-страницы"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Страница не найдена" }), path).toBeVisible();
    }
  });

  test("журнал: запись клиента, неверный номер, статус, отмена и восстановление", async ({ page }) => {
    const errors = watchErrors(page);
    page.on("dialog", (d) => d.accept());
    await asAdmin(page);
    await page.getByRole("button", { name: "Следующий день" }).click();
    await expect(page).toHaveURL(/date=/);

    // клик по свободной клетке у Ирины в 12:00
    // у проектов «телефон» и «компьютер» общая база — разное время, чтобы записи не накладывались
    const time = test.info().project.name === "phone" ? "12:00" : "15:00";
    const who = `Журнальная ${test.info().project.name === "phone" ? "Анна" : "Вера"}`;
    await page.getByRole("button", { name: `Записать к Ирина на ${time}` }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/Новая запись/)).toBeVisible();
    await dialog.getByLabel("Телефон клиента").fill("24 123-45-67");
    await dialog.getByLabel("Имя клиента").fill(who);
    await dialog.locator("input[type=checkbox]").first().check();
    await dialog.getByRole("button", { name: "Создать запись" }).click();
    await expect(dialog.getByText(/код оператора/)).toBeVisible();

    await dialog.getByLabel("Телефон клиента").fill(testPhone());
    await dialog.getByRole("button", { name: "Создать запись" }).click();
    await expect(dialog).toHaveCount(0);
    const block = page.getByRole("button", { name: new RegExp(who) });
    await expect(block).toBeVisible();

    await block.click();
    await page.getByRole("dialog").getByRole("button", { name: "Подтвердил" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Подтвердил" })).toHaveClass(/ring-2/);
    await page.getByRole("dialog").getByRole("button", { name: "Отменить запись" }).click();
    await expect(page.getByRole("button", { name: new RegExp(who) })).toHaveCount(0);
    await page.getByText(/Отменённые записи/).click();
    await page.getByRole("button", { name: new RegExp(who) }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Восстановить запись" }).click();
    await expect(page.getByRole("button", { name: new RegExp(who) }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("услуги: изменение цены сразу видно на сайте записи, ошибка при «цене до» меньше «от»", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin/services");
    await page.getByPlaceholder("Поиск").fill("Стрижка челки");
    await page.getByRole("button", { name: /Стрижка челки/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Цена от").fill("33");
    await dialog.getByLabel("Цена до").fill("30");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog.getByText(/меньше/)).toBeVisible();
    await dialog.getByLabel("Цена до").fill("33");
    await dialog.getByRole("button", { name: "Сохранить" }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto("/book/services");
    await page.getByPlaceholder("Найти").fill("Стрижка челки");
    await expect(page.getByText("33 BYN").first()).toBeVisible();
  });

  test("клиенты: создание, дубль, поиск, импорт и выгрузка в .xlsx", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin/clients/new");
    await page.getByLabel("Имя *").fill("Карточкина Мария");
    const phone = testPhone();
    await page.getByLabel("Телефон *").fill(phone);
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page).toHaveURL(/\/admin\/clients\/\d+$/);

    await page.goto("/admin/clients/new");
    await page.getByLabel("Имя *").fill("Дубль");
    await page.getByLabel("Телефон *").fill(`+375 ${phone}`);
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText(/уже есть: Карточкина Мария/)).toBeVisible();

    await page.goto(`/admin/clients?q=${encodeURIComponent(phone.replace(/\D/g, "").slice(-7))}`);
    await expect(page.getByRole("link", { name: "Карточкина Мария" })).toBeVisible();

    await page.goto("/admin/clients/import");
    await page.setInputFiles("input[type=file]", {
      name: "yclients.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`\uFEFFИмя;Телефон\nИмпортная Зоя;${testPhone()}\nНевалидный;24 000-00-00\n`),
    });
    await page.getByRole("button", { name: "Загрузить" }).click();
    await expect(page.getByText(/новых клиентов — 1/)).toBeVisible();
    await expect(page.getByText(/24 000-00-00/)).toBeVisible();

    await page.goto("/admin/clients");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("Скачать базу (.xlsx)").click()]);
    expect(download.suggestedFilename()).toMatch(/^clients-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  test("график: выходной у мастера убирает его время с сайта", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin/schedule");
    const row = page.getByRole("row").filter({ hasText: "Эльвира" });
    // последняя видимая клетка — день в будущем
    await row.getByRole("button").last().click();
    await page.getByRole("dialog").getByRole("button", { name: "Выходной" }).click();
    await expect(row.getByRole("button").last()).toHaveText("—");
  });

  test("рассылки и лояльность: охват считается, уровни сохраняются, ошибки понятные", async ({ page }) => {
    const errors = watchErrors(page);
    await asAdmin(page);
    await page.goto("/admin/marketing/new");
    await page.getByRole("button", { name: "Давно не были" }).click();
    await expect(page.getByText(/Подходят под фильтр/)).toBeVisible();
    await page.goto("/admin/loyalty");
    await page.getByLabel("Скидка, %").nth(1).fill("150");
    await page.getByRole("button", { name: "Сохранить уровни" }).click();
    await expect(page.getByText(/не больше 100%/)).toBeVisible();
    await page.getByLabel("Скидка, %").nth(1).fill("7");
    await page.getByRole("button", { name: "Сохранить уровни" }).click();
    await expect(page.getByText("Сохранено")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("настройки: неверный часовой пояс не сохраняется", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin/settings");
    await page.getByLabel("Часовой пояс").fill("Europe/Atlantis");
    await page.getByRole("button", { name: "Сохранить" }).first().click();
    await expect(page.getByText("Неизвестный часовой пояс")).toBeVisible();
  });
});

test.describe("приложение мастера", () => {
  test("мастер видит онлайн-запись с пометкой «Новая» и отмечает визит", async ({ page, browser }) => {
    const errors = watchErrors(page);
    // клиент записывается к Ирине
    const client = await browser.newPage();
    await client.goto("/book/staff");
    await client.getByText("Ирина", { exact: true }).click();
    await client.getByRole("button", { name: "Выбрать услугу" }).click();
    await client.getByText("Стрижка челки", { exact: true }).click();
    await client.getByRole("button", { name: "Выбрать дату и время" }).click();
    await client.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
    await client.getByRole("button", { name: "Готово" }).click();
    const clientName = `Мастерова ${test.info().project.name === "phone" ? "Ольга" : "Дарья"}`;
    await client.getByPlaceholder("Введите имя").fill(clientName);
    await client.getByPlaceholder("29 123-45-67").fill(testPhone());
    await client.getByText(/^салону .+ на обработку персональных данных$/).click();
    await client.getByRole("button", { name: "Записаться" }).click();
    await expect(client.getByText("Вы записаны!")).toBeVisible();
    const when = await client.getByText(/^\S+, \d+ \S+, \d{2}:\d{2}/).first().innerText();
    await client.close();

    await loginAs(page, "irina", "irina123");
    await expect(page).toHaveURL(/\/master/);
    await expectNoHorizontalScroll(page);
    // открываем день записи
    const dayNum = when.match(/, (\d+) /)![1];
    await page.getByRole("link", { name: new RegExp(`^\\S+\\s*${dayNum}\\b`) }).first().click();
    const card = page.getByRole("listitem").filter({ hasText: clientName }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText("Новая")).toBeVisible();
    await card.getByRole("button", { name: "Клиент пришёл" }).click();
    await expect(card.getByText("Пришёл", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(errors).toEqual([]);
  });
});
