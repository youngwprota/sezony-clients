import Link from "next/link";
import { db } from "@/lib/db";
import { Avatar } from "@/components/ui";
import { btnPrimary, card } from "@/components/form";

export const dynamic = "force-dynamic";

export default async function StaffList() {
  const staff = await db.staff.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { id: "asc" }],
    include: { _count: { select: { services: true } }, user: { select: { login: true } } },
  });
  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center">
        <h1 className="mr-auto text-2xl font-bold">Сотрудники</h1>
        <Link href="/admin/staff/new" className={`${btnPrimary} flex items-center`}>+ Сотрудник</Link>
      </div>
      <ul className={`${card} divide-y divide-line p-0`}>
        {staff.map((s) => (
          <li key={s.id}>
            <Link href={`/admin/staff/${s.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-chip/50 ${s.active ? "" : "opacity-50"}`}>
              <Avatar name={s.name} url={s.avatarUrl} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.name} {!s.active && <span className="text-sm text-muted">(уволен)</span>}</div>
                <div className="truncate text-sm text-muted">{s.specialization}</div>
              </div>
              <div className="hidden text-right text-sm text-muted sm:block">
                <div>{s._count.services} услуг</div>
                <div>
                  {s.bookable ? "онлайн-запись" : "без онлайн-записи"}
                  {s.user ? " · приложение ✓" : ""}
                  {s.telegramChatId ? " · Telegram ✓" : ""}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
