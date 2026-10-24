import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Сохраняет Web Push-подписку текущего сотрудника. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const sub = await req.json().catch(() => null);
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  // принимаем только https-адреса push-сервисов, иначе сервер можно заставить слать запросы куда угодно
  if (
    typeof endpoint !== "string" ||
    typeof p256dh !== "string" ||
    typeof auth !== "string" ||
    endpoint.length > 2000 ||
    p256dh.length > 200 ||
    auth.length > 100 ||
    !/^https:\/\/[^/]+\.(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|push\.apple\.com)\//.test(endpoint)
  ) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth, userId: session.userId },
    update: { p256dh, auth, userId: session.userId },
  });
  return NextResponse.json({ ok: true });
}
