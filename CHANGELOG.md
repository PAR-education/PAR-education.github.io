# Changes — 13 October 2026

Registration follow-up:

- Added **Registriraj se** to the login page, name/email/password confirmation validation and real Firebase account creation.
- First registration/login creates a missing inactive profile without overwriting existing approvals. This also fixes Auth-only accounts that previously had no `users` document.
- Added the administrator pending-account filter and **Odaberi ulogu i odobri** action. Approved users receive the selected role and their waiting session automatically opens the workspace.
- Security rules permit only self-creation of an inactive, nonprivileged profile with matching Auth email. Self-activation, privileged-role selection and another person's profile creation remain denied.

- Replaced role-select demo login with Firebase email/password, reset support, session persistence, active role profiles and protected homepage initialization.
- Split the monolith into static pages, a readable design system, ES modules, auth, catalog, services, components and utilities. Removed runtime Tailwind, icon, chart, QR and PDF dependencies from production.
- Added server-side Firestore role/ownership/department/instructor rules, schema checks and default denial; prevented self-promotion and self-deactivation by administrators.
- Replaced simulated save toasts with Firestore writes and explicit loading/error states. Added pending enrollment/exam/equipment requests, validation, administrator decisions and instructor enrollment/grade permissions.
- Added tuition discount/installment calculation and transactional obligation creation with duplicate prevention.
- Added native dialogs, search, filters, light/dark themes, mobile navigation, record print-to-PDF and safe CSV export.
- Fixed selected-request export, nonfunctional syllabus export, hardcoded time-sheet month and invalid-hour fallback. Fixed a close-event race discovered during browser testing that cleared newly opened edit dialogs. Fixed narrow-screen dashboard columns.
- Preserved anonymized prototype fixtures and all original office evaluation questions in an isolated in-memory demo. Added persistent, explicitly identified evaluation submissions.
- Removed fabricated AI/ISVU successes, invented profile metrics and unverified bank barcode generation. Documented integration/rollout limits in the UI and audit.
- Added unit/rules tests and local auth+Firestore emulator fixtures. Added Firebase setup, deployment and test documentation.

No live Firebase configuration changes, live database writes, Git commits, pushes or deployments were performed.
