"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Журнал" },
  { href: "/admin/services", label: "Услуги" },
  { href: "/admin/staff", label: "Сотрудники" },
  { href: "/admin/schedule", label: "График работы" },
  { href: "/admin/clients", label: "Клиенты" },
  { href: "/admin/analytics", label: "Аналитика" },
  { href: "/admin/marketing", label: "Рассылки" },
  { href: "/admin/loyalty", label: "Лояльность" },
  { href: "/admin/settings", label: "Настройки" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:px-2">
      {ITEMS.map((i) => {
        const active = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`shrink-0 rounded-xl px-3 py-2 text-[15px] ${active ? "bg-ink text-white" : "hover:bg-chip"}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
