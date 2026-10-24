/**
 * Подключает вебхуки ботов к сайту. Запуск после деплоя: npm run setup:webhooks
 * Нужны APP_URL (https://…) и токены ботов в .env или в окружении контейнера.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const app = process.env.APP_URL?.replace(/\/$/, "");
if (!app?.startsWith("https://")) {
  console.error("APP_URL должен быть https-адресом сайта");
  process.exit(1);
}

async function main() {
  const tg = process.env.TELEGRAM_BOT_TOKEN;
  if (tg) {
    const res = await fetch(`https://api.telegram.org/bot${tg}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: `${app}/api/telegram/webhook`,
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query", "my_chat_member"],
      }),
    });
    console.log("Telegram:", JSON.stringify(await res.json()));
    // меню команд бота — «личный кабинет» клиента
    await fetch(`https://api.telegram.org/bot${tg}/setMyCommands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "status", description: "Мои визиты, скидка и записи" },
          { command: "promo", description: "Получать акции и новости" },
          { command: "stop", description: "Отписаться от акций" },
        ],
      }),
    });
  } else console.log("Telegram: TELEGRAM_BOT_TOKEN не задан, пропускаем");

  const vb = process.env.VIBER_AUTH_TOKEN;
  if (vb) {
    const res = await fetch("https://chatapi.viber.com/pa/set_webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Viber-Auth-Token": vb },
      body: JSON.stringify({ url: `${app}/api/viber/webhook`, event_types: ["conversation_started", "subscribed", "unsubscribed", "message"], send_name: true }),
    });
    console.log("Viber:", JSON.stringify(await res.json()));
  } else console.log("Viber: VIBER_AUTH_TOKEN не задан, пропускаем");
}

main();
