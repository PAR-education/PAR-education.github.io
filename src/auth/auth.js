import { getFirebase } from "../config/firebase.js";
import { isActiveProfile } from "./permissions.js";
import { pendingProfile } from "./profile.js";
import { validateRegistration } from "./registration.js";
let registrationTask = null;
export async function register(name, email, password, confirmation) {
  const input = validateRegistration(name, email, password, confirmation);
  const { auth, authentication: sdk } = await getFirebase();
  if (auth.currentUser)
    throw new Error(
      "Prije registracije drugog računa potrebno je odjaviti se.",
    );
  if (registrationTask) throw new Error("Registracija je već u tijeku.");
  const operation = (async () => {
    await sdk.setPersistence(auth, sdk.browserSessionPersistence);
    const credential = await sdk.createUserWithEmailAndPassword(
      auth,
      input.email,
      input.password,
    );
    await sdk.updateProfile(credential.user, { displayName: input.name });
    await ensurePendingProfile(credential.user);
    return credential;
  })();
  registrationTask = operation;
  try {
    return await operation;
  } finally {
    if (registrationTask === operation) registrationTask = null;
  }
}
export async function ensurePendingProfile(user) {
  const { db, firestore: sdk } = await getFirebase();
  const ref = sdk.doc(db, "users", user.uid);
  await sdk.runTransaction(db, async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists()) return; // Never overwrite an existing role or approval.
    transaction.set(ref, {
      ...pendingProfile(user),
      createdAt: sdk.serverTimestamp(),
      updatedAt: sdk.serverTimestamp(),
      createdBy: user.uid,
    });
  });
}
export async function observeSession(callback, onError) {
  const { auth, authentication, db, firestore } = await getFirebase();
  let stopProfile = () => {};
  const stopAuth = authentication.onAuthStateChanged(
    auth,
    (user) => {
      stopProfile();
      callback({ user, profile: null, loading: !!user });
      if (!user) return;
      stopProfile = firestore.onSnapshot(
        firestore.doc(db, "users", user.uid),
        (snapshot) => {
          const profile = snapshot.exists() ? snapshot.data() : null;
          if (!snapshot.exists()) {
            callback({ user, profile: null, loading: true });
            const activeRegistration = registrationTask;
            (async () => {
              // Registration must save the supplied name before the profile is created.
              if (activeRegistration) await activeRegistration;
              if (auth.currentUser?.uid !== user.uid) return;
              await ensurePendingProfile(user);
            })().catch((error) => {
              if (auth.currentUser?.uid === user.uid) onError(error);
            });
            return;
          }
          callback({
            user,
            profile: isActiveProfile(profile) ? profile : null,
            loading: false,
          });
        },
        onError,
      );
    },
    onError,
  );
  return () => {
    stopAuth();
    stopProfile();
  };
}
export async function login(email, password, remember) {
  const { auth, authentication: sdk } = await getFirebase();
  await sdk.setPersistence(
    auth,
    remember ? sdk.browserLocalPersistence : sdk.browserSessionPersistence,
  );
  return sdk.signInWithEmailAndPassword(auth, email.trim(), password);
}
export async function logout() {
  const { auth, authentication } = await getFirebase();
  return authentication.signOut(auth);
}
export async function resetPassword(email) {
  const { auth, authentication } = await getFirebase();
  return authentication.sendPasswordResetEmail(auth, email.trim());
}
