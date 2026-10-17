// Synchronize only explicit courseId links. Never infer ownership from a title.
export function courseScheduleUpdates(events, courseId, course) {
  const instructorUid = course.instructorUid || "",
    instructorName = course.instructorName || "";
  return events
    .filter(
      (row) =>
        row.courseId === courseId &&
        ((row.instructorUid || "") !== instructorUid ||
          (row.instructorName || "") !== instructorName),
    )
    .map((row) => ({ id: row.id, instructorUid, instructorName }));
}
export async function saveCourseAndSchedule(
  sdk,
  db,
  courseId,
  values,
  uid,
  allowCreate = false,
) {
  const snapshot = await sdk.getDocsFromServer(
    sdk.query(
      sdk.collection(db, "calendarEvents"),
      sdk.where("courseId", "==", courseId),
      sdk.limit(450),
    ),
  );
  if (snapshot.size >= 450)
    throw new Error(
      "Kolegij ima previše termina za jedno sigurno spremanje. Ništa nije promijenjeno.",
    );
  return sdk.runTransaction(db, async (tx) => {
    const courseRef = sdk.doc(db, "courses", courseId),
      previous = await tx.get(courseRef);
    if (!previous.exists() && !allowCreate)
      throw new Error("Kolegij više ne postoji.");
    const course = { ...(previous.exists() ? previous.data() : {}), ...values };
    if (course.instructorUid) {
      const profile = await tx.get(sdk.doc(db, "users", course.instructorUid));
      if (
        !profile.exists() ||
        profile.data().role !== "profesor" ||
        profile.data().active !== true
      )
        throw new Error(
          "UID mora pripadati aktivnom računu s ulogom profesor. Kolegij i raspored nisu promijenjeni.",
        );
      if (!course.instructorName)
        course.instructorName = profile.data().name || "";
    }
    const events = [];
    for (const document of snapshot.docs) {
      const latest = await tx.get(document.ref);
      if (latest.exists() && latest.data().courseId === courseId)
        events.push({ ...latest.data(), id: latest.id });
    }
    const changes = courseScheduleUpdates(events, courseId, course);
    const data = {
      ...values,
      instructorUid: course.instructorUid || "",
      instructorName: course.instructorName || "",
      updatedAt: sdk.serverTimestamp(),
    };
    if (previous.exists()) tx.update(courseRef, data);
    else
      tx.set(courseRef, {
        ...data,
        createdAt: sdk.serverTimestamp(),
        createdBy: uid,
      });
    for (const change of changes) {
      const { id, ...fields } = change;
      tx.update(sdk.doc(db, "calendarEvents", id), {
        ...fields,
        updatedAt: sdk.serverTimestamp(),
      });
    }
    return { syncedEvents: changes.length };
  });
}
