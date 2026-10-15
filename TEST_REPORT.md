## Excel uvoz i raspored — 15.10.2026.

28 unit/integracijskih testova i 17 Firestore testova prolazi. Novi XLSX predlošci imaju listove Podaci, Upute i Izbori. Testirani su ponavljanja i iznimke, provjera kolizija, ponovno učitavanje bez duplikata, studentski JMBAG i očuvanje veza na račune, te zabrana nastavniku da mijenja tuđu nastavu. Browser demo: preuzet stvarni predložak, uvezena 2 termina uz izostavljen neispravan redak i jedan student bez računa. Produkcijska baza nije mijenjana. Detalji: EXCEL_IMPORT.md.

## Backup/calendar provjera 14.10.2026.

19 unit + 15 Firestore testova prolazi. Provjeren puni JSON i inkrementalni ZIP kroz demo UI, djelomičan import 10 kolegija te export/import JSON i CSV u stvarnom Auth/Firestore emulatoru. Export je paginiran (provjera 510 dokumenata); ispravan inkrementalni lanac, promjene i brisanja, UTC Zagreb/DST i ICS escaping imaju testove. Preuzeto 10 događaja u ICS. Vanjski Google račun nije mijenjan. Detalji: BACKUP_CALENDAR.md.

# Verification — 13 October 2026

Tests ran locally against the modular implementation. Live Firebase and GitHub Pages were not modified.

## Automated checks

| Check                          | Result                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `npm run check`                | All application/tool/test JavaScript parses; static page asset paths resolve; no inline event handlers |
| `npm test`                     | **12 passed, 0 failed**                                                                                |
| Firestore emulator rules suite | **12 passed, 0 failed**                                                                                |

Tools: Node.js 24.19.0, Firebase SDK 13.0.0, Firebase CLI 15.33.0, rules-unit-testing 6.0.0, Firestore emulator 1.22.0 and portable Java 21. The JRE came from Adoptium's official endpoint and its SHA-256 matched the release metadata. It is in the ignored `.reference` directory, not installed system-wide or shipped with the app.

Rules were checked both with `npm run test:rules` and directly against a running local emulator. The registration follow-up used `npm run test:rules` with the new restricted self-provisioning policy. Expected PERMISSION_DENIED output belongs to tests intentionally asserting that forbidden operations fail.

Unit coverage: recognized active profiles, role boundaries, query scopes, prototype-property names, HTML escaping, form/range/URL/option/date validation, catalog consistency, selected-record print escaping, CSV formula/quote/newline escaping, tuition rounding/calendar rollover, isolated demo query ownership and duplicate requests.

Rules coverage: anonymous/disabled/unprovisioned denial, self-promotion/self-activation denial, administrator profile provisioning and self-deactivation denial, student finance ownership/query boundaries, departmental dossier boundaries, owned requests and forbidden approvals, assigned-course grading/approved enrollment, deterministic booking IDs/trusted instructor references, lab request decisions, extra-field/schema rejection and unknown collection denial.

## Browser checks executed

Using the Codex browser against the local static server, including the `/par/` subdirectory:

- Opening production `homepage.html` while signed out redirected to `index.html`.
- Local Auth emulator login as student reached the scoped workspace.
- Student request form automatically supplied ownership and locked initial status. Saved request persisted in Firestore after a full page reload.
- Logout returned to login; reopening the protected URL remained blocked.
- Wrong password displayed the localized credential error.
- Administrator login could edit the student's request and persist status `Riješeno` and a response.
- A real emulator Auth account without a Firestore profile stayed on the pending-access login screen.
- Password reset showed neutral success feedback using the Auth emulator; no live email was sent.
- Demo role switching filtered student navigation/records. A submitted demo request appeared without modifying Firebase.
- Every one of the 23 module/help navigation entries rendered its expected heading in the administrator demo; no browser console errors were captured in that pass.
- Light and dark themes were viewed. Mobile breakpoint at 390×844 showed two dashboard columns without document horizontal overflow. Navigation opened and closed on selection. Desktop breakpoint at 1280×900 was visually inspected.
- An edit-dialog regression was found and fixed: a deferred close event cleared an immediately reopened edit form. The administrator request-edit flow passed after the fix.
- Narrow-screen dashboard columns were fixed. Closed mobile sidebar is now inert and hidden from assistive technologies.

A desktop demo screenshot was saved outside the repository as a review artifact. Sample accounts/data were fictional local fixtures.

## Verification limits

Module rendering is a smoke test, not exhaustive testing of every business workflow. These checks do not certify payroll/academic policies, bank/ISVU/AI integrations, exam seat allocation or equipment exclusivity. Native print-to-PDF depends on the user's print dialog. Live account provisioning, authorization-domain configuration, email delivery, rule publication and GitHub Pages deployment remain operator setup steps. The 250-record module read limit is documented and visibly indicated.

## Repeat

```sh
npm ci
npm run check
npm test
# Java 21+ on PATH:
npm run test:rules
```

For browser login checks use the separate Auth/Firestore emulator commands in README.md. The fixture/rules setup scripts are pinned to local `demo-par-education` emulators.

## Registration follow-up verification

Added two unit checks for inactive profile construction and registration field/confirmation validation, and two rules checks for restricted self-provisioning, forged identity and forbidden activation. All 12 unit and 12 rules tests pass.

Browser checks using local Auth/Firestore emulators: mismatched password confirmation was rejected; registration created the account and profile with the supplied full name; the unapproved account could not bypass the homepage guard; an independent administrator session filtered pending registrations, chose the instructor role and approved the account; the user's waiting session automatically entered the workspace with the instructor's navigation.

The Auth-only account migration was also verified: a login for an existing Authentication account without a Firestore document automatically created an inactive profile, which appeared in the administrator's pending-account filter.

## Profile-write denial recovery

Reproduced registration against the previous administrator-only user-create policy in local Auth/Firestore emulators. Confirmed Auth account creation succeeds while profile creation is denied. The login now shows a distinct profile error and retry action instead of approval pending. Loading the current restricted self-provisioning rules and clicking retry created the inactive profile successfully. No live project rules or records were changed.
## Drag & drop regresija — 15.10.2026.

Povlačenje ponovno spojeno na tjedni i dnevni prikaz, uz postojeći prikaz dvorana. Browser demo: stvarnim povlačenjem promijenjen ponedjeljak u utorak, zauzeti termin 10–12 odbijen bez promjene podataka, zatim stvarnim povlačenjem spremljen termin 12–14 u dnevnom prikazu. Tipkovnicom provjereni pomak dana i početak 12:15. 29 unit/integracijskih testova prolazi; nova provjera pokriva 15-minutno zaokruživanje, točku hvatanja i zabranu prelaska ponoći. Firebase pravila nisu mijenjana.

