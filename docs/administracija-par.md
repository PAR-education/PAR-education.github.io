# AdministracijaPAR

Stored role: `administracija_par`; displayed name: **AdministracijaPAR**.

An administrator assigns this role in Users and roles after the account has registered. Publish the generated `firebase/firestore.rules` before assigning the role. The account must also be active.

The Studentski ured home page shows today’s teaching, student and employee counts, a mini calendar, notifications and shortcuts to add a lesson, student or professor. Main navigation contains Schedule, Students, Professors and employees, Courses, and Rooms. Notifications are also in the main navigation; documents remain under More. Courses, room registry and documents are read-only.

Permissions:

- Read student and employee dossiers across departments; add new dossiers manually.
- Add and edit any teaching event, including moving teaching and changing a series. The same availability checks, canonical course instructors, concurrency guards and audit writes apply.
- No editing or archiving existing people, deleting teaching, editing courses/room registry, importing/backups, changing account roles or accessing grades, finance, attendance, enrollment records, projects or HR records.
- New people may be saved without an Authentication UID. A dossier does not create a login or grant access. An administrator links the registered account and grants its role separately.
- Send in-app announcements to all students, all professors or both groups. Announcements use role audiences, without reading the user directory or private inboxes. Schedule saves still do not read enrollment records or send automatic notifications under another instructor’s identity.

The role is also available in the administrator’s private role preview. Production users are never changed by the preview. Emulator fixtures include `administracija_par@example.test`; the emulator password is documented in the development README.
