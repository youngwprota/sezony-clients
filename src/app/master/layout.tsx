import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sезоны — мастер",
  manifest: "/master.webmanifest",
  appleWebApp: { capable: true, title: "Sезоны", statusBarStyle: "default" },
  icons: { apple: "/icon-192.png" },
};

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
