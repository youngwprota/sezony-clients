import { getSalon } from "@/lib/booking";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSalon();
  return (
    <SettingsForm
      initial={{
        name: s.name,
        description: s.description,
        address: s.address,
        phone: s.phone,
        currency: s.currency,
        phoneCountryCode: s.phoneCountryCode,
        timezone: s.timezone,
        slotStepMinutes: s.slotStepMinutes,
        minLeadMinutes: s.minLeadMinutes,
        bookingDaysAhead: s.bookingDaysAhead,
        remindDayBefore: s.remindDayBefore,
        remindHoursBefore: s.remindHoursBefore,
      }}
    />
  );
}
