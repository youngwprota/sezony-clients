import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { StaffForm } from "./staff-form";

export const dynamic = "force-dynamic";

export default async function StaffEdit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const [salon, categories, staff] = await Promise.all([
    getSalon(),
    db.serviceCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { services: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
    }),
    isNew ? null : db.staff.findUnique({ where: { id: Number(id) || 0 }, include: { services: true, user: true } }),
  ]);
  if (!isNew && !staff) notFound();

  return (
    <StaffForm
      currency={salon.currency}
      telegramLinked={!!staff?.telegramChatId}
      categories={categories.map((c) => ({
        id: c.id,
        title: c.title,
        services: c.services.map((s) => ({ id: s.id, title: s.title, priceMin: Number(s.priceMin), priceMax: Number(s.priceMax), durationMin: s.durationMin })),
      }))}
      initial={{
        id: staff?.id,
        name: staff?.name ?? "",
        specialization: staff?.specialization ?? "",
        bio: staff?.bio ?? "",
        avatarUrl: staff?.avatarUrl ?? "",
        active: staff?.active ?? true,
        bookable: staff?.bookable ?? true,
        login: staff?.user?.login ?? "",
        password: "",
        services: (staff?.services ?? []).map((s) => ({
          serviceId: s.serviceId,
          priceMin: s.priceMin === null ? null : Number(s.priceMin),
          priceMax: s.priceMax === null ? null : Number(s.priceMax),
          durationMin: s.durationMin,
        })),
      }}
    />
  );
}
