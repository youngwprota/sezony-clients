import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSalon } from "@/lib/booking";
import { AdminNav } from "./nav";
import { logoutAction } from "./actions";

export const metadata: Metadata = { title: "Sезоны — админка" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const salon = await getSalon();
  return (
    <div className="flex min-h-dvh flex-col bg-[#f6f6f7] lg:flex-row">
      <aside className="sticky top-0 z-30 flex shrink-0 flex-col border-b border-line bg-white lg:h-dvh lg:w-56 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 lg:pb-4">
          <span className="text-lg font-bold">{salon.name}</span>
          <form action={logoutAction} className="lg:hidden">
            <button className="text-sm text-muted">Выйти</button>
          </form>
        </div>
        <AdminNav />
        <form action={logoutAction} className="mt-auto hidden p-4 lg:block">
          <button className="text-sm text-muted">Выйти</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
    </div>
  );
}
