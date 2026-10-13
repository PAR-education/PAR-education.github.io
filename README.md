# PAR Education ERP

Vanilla JavaScript ES modules, Croatian UI, Firebase Authentication and Cloud Firestore. No production build step. The public entry point is **index.html** (login); the authenticated workspace is **homepage.html**.

## First launch

1. Follow [FIREBASE_SETUP.md](FIREBASE_SETUP.md) to publish the rules and create the first administrator. The provided Firebase web configuration is already in `src/config/firebase.js`.
2. Push these files to your GitHub repository. In Settings → Pages, choose Deploy from a branch, your publishing branch and `/ (root)`.
3. Open your Pages URL. Root domains and project paths such as `/par/` both work because assets and redirects are relative.

No Firebase service-account key belongs in this repository. No accounts or roles are created automatically. New accounts without an active administrator-assigned profile cannot enter the workspace.

## Local development

Node.js 22 or newer is recommended for the test tools.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4173/` or `http://127.0.0.1:4173/par/`. Firebase SDKs are loaded from Google's versioned CDN. `npm ci` is for development/tests; GitHub Pages needs only the committed static files.

`demo.html` uses anonymized, fictional prototype fixtures. All changes stay in memory and disappear on reload. It never initializes Firebase, supplies real authentication, or seeds a database. Remove the demo link/page if you do not want a public preview.

## Architecture

| Path                                | Purpose                                                                            |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `index.html`, `src/login.js`        | Email/password login, reset, remember-session option, pending access state         |
| `homepage.html`, `src/main.js`      | Guarded workspace, navigation, tables, forms and dashboard                         |
| `src/auth/`                         | Session observation, protected profile validation, UI permissions and query scopes |
| `src/config/firebase.js`            | Public web configuration, SDK loader, strictly local emulator switch               |
| `src/modules/catalog.js`            | Module descriptions, fields, validators and table columns                          |
| `src/services/records.js`           | Firestore queries, CRUD, transactional bookings and tuition installments           |
| `src/components/`                   | Accessible dialogs, escaped print reports, CSV export                              |
| `src/utils/`                        | Validation, escaping, themes and tuition math                                      |
| `src/data/`, `src/services/demo.js` | Anonymized demo fixtures and original office evaluation questions                  |
| `assets/css/main.css`               | Responsive light/dark design system                                                |
| `firebase/firestore.rules`          | Authoritative access and document validation                                       |
| `scripts/generate-rules.mjs`        | Rule generator; regenerate after changing catalog fields or policies               |
| `tests/`                            | Unit tests and real Firestore rules emulator tests                                 |

The pasted source is retained locally at `.reference/original.html`, which is gitignored. It is not a public deployment artifact. `scripts/extract-baseline.mjs` is a one-time migration utility requiring that local reference; it is not part of normal development or deployment.

## Available workflows

- Six roles: administrator, department head, instructor, lab manager, student, alumni.
- Role-scoped student/employee records, course syllabi, events, exams, grades and enrollment requests.
- Projects, research, equipment inventory, equipment requests and document links.
- Student document requests and administrator responses; employee time records and leave approvals.
- Finance obligations, tuition discount calculations and 1/2/10 installment plans. Transactional creation prevents duplicates for the same student/year.
- Alumni events, notifications, office-specific evaluation templates and submitted evaluations.
- Search, status filters, monthly time-sheet totals, record details, CRUD where permitted, CSV and print-to-PDF.

Grades entered by instructors require an approved enrollment in their assigned course. Course and student relationships use document IDs and Firebase Auth UIDs, not names. Exam/equipment enrollment actions submit **pending requests**; they do not claim confirmed seats or exclusive equipment reservations.

## Checks

```sh
npm run check
npm test
npm run test:rules
```

Rules tests require Java 21+ on PATH. They use the isolated project `demo-par-education`, not the live database. See [TEST_REPORT.md](TEST_REPORT.md) for executed results and browser coverage.

For a full local login/Firestore test:

```sh
npx firebase emulators:start --only auth,firestore --project demo-par-education
# In a second terminal, after the emulators are ready:
node scripts/seed-emulators.mjs
npm run dev
```

Open `http://127.0.0.1:4173/par/index.html?emulator=1`. Accounts are `<role>@example.test`, password `Local-test-123!`. These are local disposable accounts only. The emulator query parameter is honored only on `localhost` and `127.0.0.1`; it cannot bypass production authentication. Use a fresh emulator run before reseeding.

## Operating limits

This is a functional static ERP foundation, not a completed institutional ERP rollout. ISVU, AI, bank payment processing, official certificate signing, private file uploads, automatic timetable conflict detection, attendance hardware and automated email delivery need trusted backend integrations and institutional requirements. They are explicitly described in the app's Help view and [AUDIT.md](AUDIT.md).

Each module currently reads at most 250 accessible records from the server. The UI indicates the limit; search/filter/export operate on that loaded set. Add cursor pagination and database-backed search before a large rollout. Dashboard counts are counts of loaded accessible records, not authoritative institution totals.

No real records, analytics or authentication passwords are stored in the repository. Firebase is authoritative for access, but GitHub Pages itself remains a public static host: the HTML shell and JavaScript can be fetched publicly. Sensitive records live only in Firestore and require published security rules. Copying a homepage URL does not grant database access.

SDK and font CDNs require internet access. Financial and academic retention policies, institutional privacy notices and service contracts must be defined by the institution before using real records.
