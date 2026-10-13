# Firebase setup — par-education

The app is already configured for the project from your screenshots. Email/password is enabled and Firestore exists. The remaining steps are to publish rules, provision the first administrator and confirm the deployed hostname.

## 1. Publish the database rules

Open [Firebase Console](https://console.firebase.google.com/project/par-education/firestore/rules), choose Cloud Firestore → Rules, replace the complete existing rules with **`firebase/firestore.rules`**, and press Publish.

Do not use test-mode `allow read, write: if true` rules. An empty database is expected; no mock records are uploaded automatically.

Alternatively, from an authenticated local terminal:

```sh
npx firebase login
npx firebase deploy --only firestore:rules,firestore:indexes --project par-education
```

These commands deploy only the database rules/index configuration, not the GitHub Pages site. The setup was not performed against your live project during this refactor.

## 2. Create the first administrator account

1. Publish the current rules and push the updated application files to GitHub Pages.
2. Open the site and use **Registriraj se**, or log in with your existing Authentication account.
3. The application automatically creates `users/<your Authentication UID>` with `active: false`. Firestore now shows the `users` collection.
4. In Firebase Console → Firestore → Data, open your own document and change `role` to string **`admin`**, and `active` to boolean **`true`**. You can set `departmentId` to `uprava`.
5. Your waiting login screen detects the approval and enters the workspace. This is the only administrator activation that must be done through the Console.

The complete profile fields are:

| Field          | Firestore type | Example/value                    |
| -------------- | -------------- | -------------------------------- |
| `name`         | string         | Your administrator's name        |
| `email`        | string         | The same email as Authentication |
| `role`         | string         | `admin`                          |
| `active`       | **boolean**    | **true**                         |
| `departmentId` | string         | `uprava`                         |

Initial administrator privileges are granted through the trusted Console. The application can only create its own inactive student profile and cannot activate itself or select a privileged role. Do **not** temporarily open the rules to bootstrap. If using an older version of the app, the same profile can still be created manually in a `users` collection with the exact Auth UID as the document ID.

Open the deployed site's `index.html` and log in. You should enter `homepage.html` and see “Korisnici i uloge”. A missing or inactive profile shows a pending-access message on the login page. The displayed UID helps the administrator find the correct document.

## 3. Configure domains

Authentication → Settings → Authorized domains:

- `par-education.github.io` for this repository's expected root Pages URL.
- `rescience-sm.github.io` **only if** you also deploy to the original `/par/` site.
- `localhost` for local development, already present in your screenshot.
- Any actual custom domain you use.

Enter hostnames only; no `https://` and no path. The screenshot shows `PAR-education.github.io`; verify the lowercase hostname matches the final Pages deployment. Email/password is the implemented provider. Google sign-in is not implemented or required. Set Firebase Authentication email templates/action URLs to your real deployment when configuring password-reset mail.

## 4. Provision additional accounts

Users can create their own Authentication account using **Registriraj se** on the login page. They supply name, email, password and password confirmation. The profile is created automatically, but it cannot access ERP data until approved. Administrators manage profiles and roles, not other people's Authentication passwords.

1. User registers on the login page and sees **Čeka odobrenje**.
2. Administrator → **Korisnici i uloge** → Pristup filter → **Neaktivni / čeka odobrenje**.
3. Open the user's details → **Odaberi ulogu i odobri**. Select the appropriate role/department, confirm the **Aktivan račun** checkbox and save.
4. The user's waiting session automatically enters the workspace after approval. Alternatively they can log in later. Rejected/unapproved accounts remain inactive and cannot read ERP data.

Administrators may still preprovision accounts through the Console. A missing profile will be created automatically at first login, or an administrator can create it in the application's profile form using the exact UID. There is no public role selector, automatic first-user administrator or client-side self-activation.

Supported role IDs (use exactly these spellings):

| Role ID         | Access                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `admin`         | All operational collections; profile/role management, financial obligations, leave decisions                          |
| `dept_head`     | Student/employee dossiers in matching department; project management; own research, schedules, time entries and leave |
| `profesor`      | Assigned course grading/exams/enrollment decisions; own research, schedules, time entries and leave                   |
| `lab_assistant` | Inventory management and equipment request decisions; own research, schedules, time entries and leave                 |
| `student`       | Own grades/enrollments/bookings/requests/finances; course/exam catalogs, equipment requests and documents             |
| `alumni`        | Alumni events, own requests, evaluations and notifications; course/catalog/document access                            |

All recognized active roles can read published calendar events/course syllabi/document metadata and submit their own evaluation. No user can grant themselves a role. Administrators cannot remove or deactivate their own administrator profile through the application rules. Never assign administration to an untrusted account.

Deactivating a profile immediately removes database access. The profile listener hides the workspace and returns that user's page to the login/pending screen when the change arrives. Previously downloaded/exported information cannot be recalled.

## 5. Add operational records and relationships

- `students` and `employees`: `ownerUid` is the person's Authentication UID. `departmentId` must match the department-head profile to enable departmental queries. Changing a dossier does not change the user's role.
- `courses`: document ID identifies the course; `instructorUid` is the assigned teacher's Authentication UID.
- `enrollments`: students create them using the course detail “Pošalji prijavu”. ID is `<courseId>__<studentUid>`. The assigned teacher/admin approves them.
- `grades`: use the student's UID, assigned instructor UID and course document ID. Instructor writes require an approved matching enrollment. Administrators can manage institutional records.
- `exams`: `courseId` points to a real course. Instructors can manage only their assigned courses; students submit pending exam bookings.
- `finances`: `ownerUid` determines which student sees the obligation. Student details → Školarina lets an administrator calculate discounts/installments and create all obligations atomically.
- `employeeSchedules`, `workEntries`, `vacations`, `requests`, `notifications`, `evaluations`: access is tied to `ownerUid`.
- `documents`: this version stores metadata and HTTPS links only. Never publish a private file on GitHub Pages or rely on a hidden link to protect it. Storage uploads require separately deployed Storage rules and an upload workflow.

Use the application's forms for operational writes. They add `createdAt`, `updatedAt` (server timestamps) and `createdBy`. Manually created operational documents must follow `src/modules/catalog.js` and the rules' schema/metadata requirements, otherwise future edits will be denied. The exception is the first `users` bootstrap profile described above.

## 6. Verify before entering real data

Log in as administrator, provision a test student and confirm:

1. Logged-out navigation to `homepage.html` redirects to `index.html`.
2. The student sees only their records and cannot modify grades, finances or users.
3. A submitted request persists after a reload and the administrator can process it.
4. An instructor cannot grade another instructor's course.
5. A missing/inactive profile cannot enter the workspace.
6. Sign-out removes the workspace and signing in on a shared computer without “Zapamti prijavu” uses session persistence.

Local emulator checks have already been run; live email delivery, live account provisioning, deployment and project-specific quotas require verification in your project.

## References

- [Firebase email/password authentication](https://firebase.google.com/docs/auth/web/password-auth)
- [Firebase CDN module setup](https://firebase.google.com/docs/web/alt-setup)
- [Firestore rule conditions](https://firebase.google.com/docs/firestore/security/rules-conditions)
- [Firebase rules unit testing](https://firebase.google.com/docs/rules/unit-tests)
