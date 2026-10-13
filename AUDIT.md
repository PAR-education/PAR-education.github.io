# Pasted prototype audit and migration

Reviewed the complete 2,501-line pasted HTML application, its inline scripts/styles, all 17 view functions plus the evaluation module, mock generators and 42 named JavaScript functions. The target checkout initially contained only `.git`. The supplied source is the baseline; the referenced live URL was unavailable to the web fetch tool. There was no existing automated test suite or production Firebase data layer. The prototype was inspected statically; its old workflows were not claimed to have passed browser tests.

The other pasted document is treated as a design/requirements reference. The user's direct request supplies the actual Firebase configuration and overrides its older “configuration later” wording. No external deployment, push or account-management instructions were inferred from the attachments.

## Original architecture and dependencies

- One HTML file combines markup, runtime Tailwind configuration, CSS, mock generation, a Proxy-based Store, RBAC, template renderers and global event handlers.
- Dependencies: runtime Tailwind CDN, Font Awesome, unversioned Chart.js, QRCodeJS, html2pdf.js and Google Fonts.
- Store state: user, role, activeTab, notifications, darkMode, calendarView, scheduleView, timeTrackingView. Dispatch/subscriber render callbacks couple navigation directly to templates.
- Six roles: `admin`, `dept_head`, `profesor`, `lab_assistant`, `student`, `alumni`.
- Mock models: students, employees, courses, projects, finances, grades, vacations, requests/history, documents, calendarEvents, exams with embedded enrolledStudents, labs, research, alumniEvents, enrolledCourses, employeeSchedules and timeEntries. Relationships mix numeric IDs, display names and array position. Employee/student email data and official-looking certificates are embedded in public source.
- Evaluation templates contain 11 named staff/office profiles and 34 questions. The office questions are preserved with the personal identities removed from public fixtures.

## Prioritized findings

| Priority | Finding                                                                                                                         | Resolution                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| P0       | Role selector and timed animations create a session without authenticating a password.                                          | Firebase email/password, observed auth state and protected active profiles.                                          |
| P0       | Hiding navigation is the only effective authorization boundary; global state can select arbitrary views.                        | Firestore rules enforce identity, role, department, owner and instructor scopes; unknown collections denied.         |
| P0       | Every user downloads all mock finance/employee/student records; template fields are interpolated without escaping.              | Production data resides only in Firestore; scoped server queries, HTML escaping, whitelisted schemas and CSP.        |
| P1       | ISVU, lab/exam bookings, vacation submissions and grade changes can show success without persistence.                           | Real CRUD and pending booking requests; ISVU remains explicitly disconnected.                                        |
| P1       | Student request export always selects the first request.                                                                        | Export receives the selected record.                                                                                 |
| P1       | Syllabus export is a success toast only.                                                                                        | Course detail print report includes the actual syllabus fields.                                                      |
| P1       | Time-sheet export assumes August 2026, hardcoded weekends and 31 days; inputs fall back to 8 hours on invalid input.            | Date/month filtering, validated hours, totals from actual entries and print/CSV exports.                             |
| P1       | Anonymous-looking evaluation PDFs contain identity/context and are never saved to a database.                                   | Identified evaluations with explicit non-anonymous notice, office templates, persisted submissions and print export. |
| P1       | Course drag/drop changes room/time without save, permission or conflict validation.                                             | Permission-controlled persisted course form edits; no unverified drag/drop or automatic conflict claims.             |
| P1       | AI assistant fabricates state/synchronization replies and interpolates user text into HTML.                                     | Honest Help/integration view; no simulated AI answers.                                                               |
| P2       | ECTS/skills/grade charts and alumni totals present fabricated metrics.                                                          | Dashboard counts derive from accessible records; illustrative metrics are not published as facts.                    |
| P2       | Modals lack reliable focus trapping/return; decorative styling, floating overlays and dense mobile cards compete for attention. | Native dialogs, keyboard focus, explicit labels, restrained design system and mobile navigation.                     |
| P2       | No durable saves, loading/error contracts, test harness or setup docs.                                                          | Centralized data/auth modules, error/empty states, tests and documentation.                                          |

## Original function inventory and replacements

| Original functions                                                                                                                                       | Original dependencies                                      | Current replacement                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| generateBigData                                                                                                                                          | DUMMY_DATA, nested numeric IDs                             | Anonymized fixtures in `src/data/`; never seeded into production                            |
| buildNavigation, renderActiveView                                                                                                                        | RBAC, appStore, views, nav-menu, main-content              | Permissions/catalog, guarded routes, modular workspace renderer                             |
| handleLogin, handleLogout                                                                                                                                | role select, login/app DOM, Store, timers                  | `src/auth/auth.js`, `src/login.js`, active-profile gate                                     |
| toggleDarkMode, toggleMobileMenu                                                                                                                         | Store, root class, sidebar/overlay                         | Theme helpers, persistent preference, mobile navigation                                     |
| openModal, closeModal, showToast                                                                                                                         | global modal IDs, toast DOM                                | Dialog and notification components                                                          |
| openEmployeeDetails, renderEmployeeModalTimeTable, toggleProjectSelectInEmpModal, handleEmployeeCardTimeSubmit, exportFormalTimesheet                    | employee IDs, timeEntries, forms, selected global employee | Employee details and scoped work-entry CRUD, monthly totals/export                          |
| openStudentDetails, openTuitionConfigModal, handleTuitionConfigSubmit                                                                                    | students, finances, Chart.js, modals                       | Student details, transactional tuition obligation creation and finance forms                |
| handleCourseDragStart, handleCourseDrop, openCourseModal, exportSyllabus                                                                                 | drag global, courses, Store                                | Course form editing and selected syllabus print                                             |
| openProjectDetails                                                                                                                                       | project-name matching, project modal                       | ID-based project details and CRUD                                                           |
| triggerISVUSync                                                                                                                                          | toast and timeout                                          | Explicit integration limitation                                                             |
| openBarcodeModal                                                                                                                                         | QRCodeJS, hardcoded payment payload                        | Payment-reference field; bank barcode integration deferred                                  |
| approveVacation, handleVacationSubmit                                                                                                                    | vacations, employee-name matching, toast                   | Persisted owned leave requests and admin decisions                                          |
| openRequestDetails, handleRequestSubmit, exportRequestPDF, downloadStudentCertificate                                                                    | requests, history, first-record selection, popup templates | Persisted request workflow and selected-record print; official certificate signing deferred |
| initChatbot, toggleChat, handleChatSubmit                                                                                                                | role, DUMMY_DATA, chat DOM, hardcoded replies              | Help and honest integration status                                                          |
| openEvalModule, closeEvalModule, renderEvalEmployees, filterEvalEmployees, selectEvalEmployee, highlightActiveEvalEmp, populateEvalForm, generateEvalPDF | EVAL_DATA, currentEvalEmp, rating DOM, html2pdf            | Office templates, identified evaluation form, persisted answers and native print-to-PDF     |

## Module migration and deliberate limitations

| Prototype view                    | Implemented behavior                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard                         | Accessible-record counts, upcoming events, shortcuts and notifications; counts capped at 250 per collection                         |
| Calendar / courses                | Persisted event list and course timetable fields/syllabi; visual week/Gantt and automatic conflict resolution deferred              |
| Exams / ISVU grades               | Persisted terms, pending bookings, assigned-instructor grading; ISVU API is not connected                                           |
| Projects / research               | Project detail/CRUD; research owned by staff unless administrator                                                                   |
| Labs                              | Inventory and persisted pending equipment requests; allocation conflicts/capacity require institutional workflow                    |
| Documents                         | Published HTTPS document metadata; secure uploads and Storage integration deferred                                                  |
| Requests                          | Student/alumni submissions and administrator responses; signed official certificates need backend workflow                          |
| Alumni                            | Persisted events; networking/messaging requires separate backend specifications                                                     |
| Finances                          | Obligations, paid/unpaid status, tuition discount and installment creation; no bank transaction or verified payment barcode         |
| Students / employees              | Role/department-scoped dossiers and administrator CRUD; no fabricated charts                                                        |
| Employee schedule / time tracking | Own schedules, daily time entries, month filtering and real totals; no biometric attendance or automatic legal payroll calculations |
| Vacations                         | Owned requests and administrator approval/rejection                                                                                 |
| Evaluation                        | All original office question templates, identified persisted responses and print export                                             |
| AI                                | Explicitly disconnected; no fabricated synchronization or answers                                                                   |

## Implementation plan and remaining rollout work

Completed: isolate source/fixtures; establish auth/profile guard and security rules; split static pages/styles/config/services/components/modules; connect operational forms; improve accessible/responsive UI; implement transactional bookings/tuition; execute unit, rule and browser checks; document setup.

Before live use: publish the rules, create the first administrator, provision real users, confirm the Pages hostname and verify live authentication/password reset. Define institutional approval/capacity, academic permissions, privacy/retention and official document policies. Add pagination for large collections and a trusted backend for Authentication account administration, uploads, integrations and scheduled notifications.

Security rules protect database records, not HTML files. GitHub Pages is public and cannot provide server-side protection of the static workspace shell. No sensitive production data is embedded in that shell. The UI must not be interpreted as proof of database authorization; rules are the boundary.

## Registration follow-up

Added public Firebase registration with password confirmation and an automatically created inactive user profile. Existing Auth-only accounts are repaired on first login. Only administrators can approve accounts or change roles. Updated security rules allow only own inactive profile creation with matching token email and server timestamps. The administrator user module includes a pending-account filter and an explicit approval action. Browser verification covered registration, guard denial before approval, assigned instructor role after approval, and Auth-only profile creation.
