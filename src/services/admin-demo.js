import { demoData } from "../data/demoData.js";
import { DemoRecords } from "./demo.js";
import { isActiveProfile } from "../auth/permissions.js";
import { weekMonday, zagrebDate } from "../utils/calendar.js";
export function canUseDemo(user, profile) {
  return !!user?.uid && isActiveProfile(profile) && profile.role === "admin";
}
export async function createAdminDemo(user, profile, load = demoData) {
  if (!canUseDemo(user, profile))
    throw new Error(
      "Demo je dostupan samo prijavljenom aktivnom administratoru.",
    );
  const data = structuredClone(await load()),
    monday = weekMonday(zagrebDate());
  const days = { Pon: 0, Uto: 1, Sri: 2, Čet: 3, Pet: 4, Sub: 5, Ned: 6 };
  for (const row of data.calendarEvents || []) {
    if (days[row.day] === undefined) continue;
    const date = new Date(monday + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + days[row.day]);
    row.date = date.toISOString().slice(0, 10);
  }
  const demoProfile = {
    name: "Administrator demonstracije",
    role: "admin",
    active: true,
    departmentId: "poslovanje",
  };
  return {
    user,
    profile: demoProfile,
    repository: new DemoRecords(data, user, demoProfile),
    demo: true,
  };
}
