import { db } from "@/lib/db";
import { getSalon } from "@/lib/booking";
import { ServicesAdmin } from "./services-admin";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const [salon, categories, staff] = await Promise.all([
    getSalon(),
    db.serviceCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { services: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { staff: { select: { staffId: true } } } } },
    }),
    db.staff.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true, name: true, specialization: true } }),
  ]);
  return (
    <ServicesAdmin
      currency={salon.currency}
      staff={staff}
      categories={categories.map((c) => ({
        id: c.id,
        title: c.title,
        services: c.services.map((s) => ({
          id: s.id,
          categoryId: s.categoryId,
          title: s.title,
          description: s.description,
          priceMin: Number(s.priceMin),
          priceMax: Number(s.priceMax),
          durationMin: s.durationMin,
          online: s.online,
          active: s.active,
          staffIds: s.staff.map((x) => x.staffId),
        })),
      }))}
    />
  );
}
