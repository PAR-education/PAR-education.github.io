# Design QA — PAR restoration

final result: passed

Reference: supplied professor HTML and dashboard/course screenshots. Desktop comparison: 1866×915; mobile: 390×844. Implementation: local demo.html; live homepage uses the same renderers and stylesheet with Firebase authentication.

Evidence: .reference/qa/courses-final.png, dashboard-final.png, requests.png, mobile-fixed.png. Reference and implementation screenshots were opened together in the same comparison inputs.

Iteration 1: P2 nested panel squeezed course cards. Removed outer panel framing/padding, restored independent cards and red required-course badges. Recaptured and compared courses.
Iteration 2: P2 existing mobile CSS hid global search. Corrected selector precedence; browser verified searchbox visible at 390px. Document width 375px within viewport; mobile navigation works.

Required fidelity surfaces:
- Layout: navy 286px sidebar, account at top, white search header, spacious content, three-column cards and six-tile dashboard. Single-column cards on mobile; tables scroll within containers.
- Typography: Inter, 30px headings, 20px card titles, stronger numerical hierarchy.
- Spacing: 24px card gaps/corners; independent card framing matches reference.
- Colors: PAR blue/gold accents, neutral light canvas, colored icons/status badges.
- Assets: Font Awesome 6.4 as in source; original editable wordmark and initials. No fabricated PDF or photography.
- Content: source descriptions, ECTS, instructors, projects, budgets, students, grades and leave periods restored. Browser counts: 30 students, 9 employees, 10 grades, 7 projects, 5 exams, 6 requests, 12 finances, 5 leave requests, 3 research entries, 1 document, 2 alumni events.
- Interactions: navigation, course detail dialogs, search and mobile menu checked. No browser errors during module sweep. Existing edit/approval/export operations remain connected to repository.

Intentional differences: preview has sample-data banner/role selector; live UI shows authenticated account. Search/create/export toolbar retained for real usage. Leave card shows actual pending requests. Original source has no real ISVU connection or PDF file. Employee schedule displays the 42 explicit source entries; three unsupported default office rows are not fabricated.

Remaining P3 follow-ups: inline grade selectors, drag-and-drop timetable and day/month employee calendars. Record editing remains available through detail dialogs.

Validation: JavaScript/HTML check, 12 unit tests and 13 Firestore tests passed, including import of every template record and denial of student template imports.
