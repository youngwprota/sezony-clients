import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, testPhone, watchErrors } from "./helpers";

test.describe("онлайн-запись клиента", () => {
  test("полный путь: мастер → услуга → время → контакты → «Вы записаны»", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sезоны" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByText("Выбрать специалиста").click();
    await expect(page.getByRole("heading", { name: "Выбрать специалиста" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByText("Ирина", { exact: true }).click();
    await page.getByRole("button", { name: "Выбрать услугу" }).click();

    await expect(page.getByRole("heading", { name: "Выбрать услуги" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByText("Стрижка челки", { exact: true }).click();
    await expect(page.getByText("1 услуга")).toBeVisible();
    await page.getByRole("button", { name: "Выбрать дату и время" }).click();

    await expect(page).toHaveURL(/\/book\/time/);
    const slot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
    await slot.click();
    await page.getByRole("button", { name: "Готово" }).click();

    await expect(page.getByRole("heading", { name: "Детали записи" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByPlaceholder("Введите имя").fill("Тест Клиентка");
    await page.getByPlaceholder("29 123-45-67").fill(testPhone());
    await page.getByText(/^салону .+ на обработку персональных данных$/).click();
    await page.getByRole("button", { name: "Записаться" }).click();
    await expect(page.getByText("Вы записаны!")).toBeVisible();
    await expect(page.getByText("Мастер: Ирина")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("неверные номера: понятная ошибка под полем телефона, запись не создаётся", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/");
    await page.getByText("Выбрать услуги").click();
    await page.getByText("Стрижка челки", { exact: true }).click();
    await page.getByRole("button", { name: "Выбрать дату и время" }).click();
    await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
    await page.getByRole("button", { name: "Готово" }).click();
    await page.getByPlaceholder("Введите имя").fill("Анна");
    await page.getByText(/^салону .+ на обработку персональных данных$/).click();

    const phone = page.getByPlaceholder("29 123-45-67");
    const submit = page.getByRole("button", { name: "Записаться" });
    for (const [value, message] of [
      ["24 123-45-67", /код оператора/],
      ["+375 30 123-45-67", /код оператора/],
      ["29 123", /короткий/],
      ["29 123-45-678", /длинный/],
      ["8 017 123-45-67", /мобильный/],
      ["телефон", /только цифры/],
      ["+999 123 456 789", /код страны/],
    ] as const) {
      await phone.fill(value);
      await submit.click();
      await expect(page.getByText(message), value).toBeVisible();
      await expect(phone).toHaveAttribute("aria-invalid", "true");
    }
    await expect(page.getByText("Вы записаны!")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("проверка имени, e-mail и согласия", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Выбрать услуги").click();
    await page.getByText("Стрижка челки", { exact: true }).click();
    await page.getByRole("button", { name: "Выбрать дату и время" }).click();
    await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
    await page.getByRole("button", { name: "Готово" }).click();
    const submit = page.getByRole("button", { name: "Записаться" });

    await submit.click();
    await expect(page.getByText("Введите имя")).toBeVisible();
    await page.getByPlaceholder("Введите имя").fill("12345");
    await page.getByPlaceholder("29 123-45-67").fill(testPhone());
    await submit.click();
    await expect(page.getByText("Нужно согласие на обработку персональных данных")).toBeVisible();
    await page.getByText(/^салону .+ на обработку персональных данных$/).click();
    await submit.click();
    await expect(page.getByText("Имя должно содержать буквы")).toBeVisible();
    await page.getByPlaceholder("Введите имя").fill("Анна");
    await page.getByPlaceholder("Введите e-mail").fill("anna@");
    await submit.click();
    await expect(page.getByText(/Проверьте e-mail/)).toBeVisible();
  });

  test("быстрый выбор: время у мастера в списке ведёт сразу к услугам", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("/book/staff");
    const firstSlot = page.locator("li").filter({ hasText: "Ирина" }).getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
    await firstSlot.click();
    await expect(page).toHaveURL(/\/book\/services\?staff=\d+.*at=/);
    await expect(page.getByRole("button", { name: "Готово" })).toBeDisabled();
    await page.getByText("Стрижка челки", { exact: true }).click();
    await page.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByRole("heading", { name: "Детали записи" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("поиск услуг, категории и описание «ещё»", async ({ page }) => {
    await page.goto("/book/services");
    await page.getByPlaceholder("Найти").fill("маникюр");
    await expect(page.getByText("Мужской маникюр")).toBeVisible();
    await expect(page.getByText("Стрижка мужская наголо")).toHaveCount(0);
    await page.getByPlaceholder("Найти").fill("абракадабра");
    await expect(page.getByText("Ничего не найдено")).toBeVisible();
    await page.getByPlaceholder("Найти").fill("");
    await page.getByRole("button", { name: "Окрашивание", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Окрашивание", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "ещё" }).first().click();
    await expect(page.getByRole("button", { name: "свернуть" })).toBeVisible();
  });

  test("календарь: следующий месяц, «Все специалисты», недоступные дни не нажимаются", async ({ page }) => {
    await page.goto("/book/staff");
    await page.getByText("Ирина", { exact: true }).click();
    await page.getByRole("button", { name: "Выбрать услугу" }).click();
    await page.getByText("Стрижка челки", { exact: true }).click();
    await page.getByRole("button", { name: "Выбрать дату и время" }).click();
    await expect(page.getByRole("button", { name: "Все специалисты" })).toBeVisible();
    await page.getByRole("button", { name: "Все специалисты" }).click();
    await expect(page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Следующий месяц" }).click();
    await page.getByRole("button", { name: "Предыдущий месяц" }).click();
    await expect(page.getByRole("button", { name: "Предыдущий месяц" })).toBeDisabled();
  });

  test("ссылка на прошедшее время показывает «время недоступно»", async ({ page }) => {
    await page.goto("/book/confirm?services=1&at=2020-01-01T10:00:00.000Z");
    await expect(page.getByText("Выбранное время уже недоступно.")).toBeVisible();
    await page.goto("/book/confirm?services=abc&at=мусор");
    await expect(page.getByText("Выберите услуги и время записи.")).toBeVisible();
  });

  test("время, которое заняли, пока клиент заполнял форму, — понятная ошибка", async ({ page, browser }) => {
    await page.goto("/");
    await page.getByText("Выбрать специалиста").click();
    await page.getByText("Ирина", { exact: true }).click();
    await page.getByRole("button", { name: "Выбрать услугу" }).click();
    await page.getByText("Стрижка челки", { exact: true }).click();
    await page.getByRole("button", { name: "Выбрать дату и время" }).click();
    await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).last().click();
    await page.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByRole("heading", { name: "Детали записи" })).toBeVisible();
    const url = page.url();

    // второй клиент занимает это же время
    const other = await browser.newPage();
    await other.goto(url);
    await other.getByPlaceholder("Введите имя").fill("Быстрая");
    await other.getByPlaceholder("29 123-45-67").fill(testPhone());
    await other.getByText(/^салону .+ на обработку персональных данных$/).click();
    await other.getByRole("button", { name: "Записаться" }).click();
    await expect(other.getByText("Вы записаны!")).toBeVisible();
    await other.close();

    await page.getByPlaceholder("Введите имя").fill("Медленная");
    await page.getByPlaceholder("29 123-45-67").fill(testPhone());
    await page.getByText(/^салону .+ на обработку персональных данных$/).click();
    await page.getByRole("button", { name: "Записаться" }).click();
    await expect(page.getByText(/заняли|занято/)).toBeVisible();
  });
});
