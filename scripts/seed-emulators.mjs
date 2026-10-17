// Refuses to contact anything except local emulators; contains only fictional test records.
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { readFileSync } from "node:fs";
const projectId = "demo-par-education";
const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    host: "127.0.0.1",
    port: 8080,
    rules: readFileSync("firebase/firestore.rules", "utf8"),
  },
});
for (const role of [
  "admin",
  "dept_head",
  "profesor",
  "lab_assistant",
  "student",
  "alumni",
]) {
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `${role}@example.test`,
        password: "Local-test-123!",
        returnSecureToken: true,
      }),
    },
  );
  let auth = await response.json();
  if (auth.error?.message === "EMAIL_EXISTS") {
    const signIn = await fetch(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${role}@example.test`,
          password: "Local-test-123!",
          returnSecureToken: true,
        }),
      },
    );
    auth = await signIn.json();
  }
  if (!auth.localId)
    throw new Error(`Cannot create emulator account: ${JSON.stringify(auth)}`);
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "users", auth.localId), {
      name: `Test ${role}`,
      email: `${role}@example.test`,
      role,
      active: true,
      departmentId: "business",
    });
  });
}
await environment.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(doc(db, "calendarEvents", "welcome"), {
    title: "Test seminar",
    date: "2026-12-15",
    time: "10:00",
    room: "PAR",
    description: "Local emulator fixture",
    createdBy: "test-admin",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
});
await environment.cleanup();
process.stdout.write(
  "Local accounts ready: <role>@example.test / Local-test-123!\n",
);
