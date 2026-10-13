export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function display(value) {
  if (value == null || value === "") return "—";
  if (typeof value?.toDate === "function")
    return value.toDate().toLocaleString("hr-HR");
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Da" : "Ne";
  return String(value);
}
export function errorMessage(error) {
  const code = error?.code;
  return (
    {
      "auth/invalid-credential": "E-adresa ili lozinka nije ispravna.",
      "auth/wrong-password": "E-adresa ili lozinka nije ispravna.",
      "auth/user-not-found": "E-adresa ili lozinka nije ispravna.",
      "auth/invalid-email": "Unesite ispravnu e-adresu.",
      "auth/user-disabled": "Račun je onemogućen. Obratite se administratoru.",
      "auth/too-many-requests": "Previše pokušaja. Pokušajte ponovno kasnije.",
      "auth/network-request-failed": "Veza nije dostupna. Provjerite internet.",
      "permission-denied":
        "Nemate pristup ovim podacima. Provjerite ulogu i Firestore pravila.",
      unavailable: "Baza nije dostupna. Provjerite vezu i pokušajte ponovno.",
      "failed-precondition":
        "Provjerite konfiguraciju baze i potrebne indekse.",
    }[code] ||
    (error instanceof TypeError
      ? "Učitavanje usluge nije uspjelo. Provjerite vezu i ponovno učitajte stranicu."
      : error?.message || "Dogodila se pogreška. Pokušajte ponovno.")
  );
}
export function theme() {
  let saved;
  try {
    saved = localStorage.getItem("par-theme");
  } catch {
    /* storage may be disabled */
  }
  document.documentElement.dataset.theme =
    saved ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
export function toggleTheme() {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("par-theme", next);
  } catch {
    /* theme still works */
  }
}
export function pageURL(path) {
  const url = new URL(path, location.href);
  if (
    ["localhost", "127.0.0.1"].includes(location.hostname) &&
    new URLSearchParams(location.search).get("emulator") === "1"
  )
    url.searchParams.set("emulator", "1");
  return url;
}
