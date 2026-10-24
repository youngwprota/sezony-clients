/**
 * Начальные данные: настройки салона, услуги и мастера (перенесены из
 * онлайн-записи салона), демо-график на 3 недели и учётная запись владельца.
 * Повторный запуск не трогает уже заполненную базу.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import data from "./seed-data.json";

const db = new PrismaClient();

type SeedService = { key: number; category: number; title: string; description: string; priceMin: number; priceMax: number; durationMin: number };
type SeedStaff = {
  name: string;
  specialization: string;
  bio: string;
  bookable: boolean;
  services: { service: number; priceMin: number; priceMax: number; durationMin: number }[];
};

async function main() {
  await db.salon.upsert({ where: { id: 1 }, create: { id: 1, ...data.salon }, update: {} });

  if ((await db.service.count()) === 0) {
    const categoryIds = new Map<number, number>();
    for (const [i, c] of data.categories.entries()) {
      const row = await db.serviceCategory.create({ data: { title: c.title, sortOrder: i } });
      categoryIds.set(c.key, row.id);
    }

    const serviceIds = new Map<number, number>();
    const services = data.services as SeedService[];
    for (const [i, s] of services.entries()) {
      const row = await db.service.create({
        data: {
          categoryId: categoryIds.get(s.category)!,
          title: s.title,
          description: s.description,
          priceMin: s.priceMin,
          priceMax: s.priceMax,
          durationMin: s.durationMin,
          sortOrder: i,
        },
      });
      serviceIds.set(s.key, row.id);
    }

    for (const [i, st] of (data.staff as SeedStaff[]).entries()) {
      const base = new Map(services.map((s) => [s.key, s]));
      await db.staff.create({
        data: {
          name: st.name,
          specialization: st.specialization,
          bio: st.bio,
          bookable: st.bookable,
          sortOrder: i,
          services: {
            create: st.services.map((x) => {
              const b = base.get(x.service)!;
              // сохраняем только то, что отличается от базовой услуги
              return {
                serviceId: serviceIds.get(x.service)!,
                priceMin: x.priceMin !== b.priceMin ? x.priceMin : null,
                priceMax: x.priceMax !== b.priceMax ? x.priceMax : null,
                durationMin: x.durationMin !== b.durationMin ? x.durationMin : null,
              };
            }),
          },
        },
      });
    }
    console.log(`Каталог: ${services.length} услуг, ${data.staff.length} мастеров`);
  }

  if ((await db.staffShift.count()) === 0) {
    const staff = await db.staff.findMany();
    const today = new Date();
    const rows = [];
    for (let d = 0; d < 21; d++) {
      const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + d));
      if (day.getUTCDay() === 0) continue; // воскресенье — выходной
      const date = day.toISOString().slice(0, 10);
      for (const s of staff) rows.push({ staffId: s.id, date, start: "09:00", end: "21:00" });
    }
    await db.staffShift.createMany({ data: rows });
    console.log("Демо-график: пн–сб 09:00–21:00 на 3 недели");
  }

  if ((await db.user.count()) === 0) {
    const password = process.env.SEED_ADMIN_PASSWORD || "admin123";
    await db.user.create({ data: { login: "admin", passwordHash: await bcrypt.hash(password, 10), role: "OWNER" } });
    console.log(`Владелец: логин admin, пароль ${password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
