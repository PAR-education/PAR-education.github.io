import { getFirebase } from "../config/firebase.js";
import { isActiveProfile } from "./permissions.js";
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
