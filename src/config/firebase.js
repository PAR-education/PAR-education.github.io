// Public web configuration, not an administrative credential.
export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyAtR_e2BgqiGMpHvkz6tl0FSxRDKcasDdk",
  authDomain: "par-education.firebaseapp.com",
  projectId: "par-education",
  storageBucket: "par-education.firebasestorage.app",
  messagingSenderId: "252262664068",
  appId: "1:252262664068:web:9bddd96aaa3485fcf17fd1",
  measurementId: "G-BGNKHX78DN",
});
let promise;
export function getFirebase() {
  // Dynamic imports let the page show a useful error if the CDN is unavailable.
  promise ??= (async () => {
    const base = "https://www.gstatic.com/firebasejs/13.0.0/";
    const [core, authentication, firestore] = await Promise.all([
      import(`${base}firebase-app.js`),
      import(`${base}firebase-auth.js`),
      import(`${base}firebase-firestore.js`),
    ]);
    const localEmulator =
      ["localhost", "127.0.0.1"].includes(location.hostname) &&
      new URLSearchParams(location.search).get("emulator") === "1";
    const app = core.initializeApp(
      localEmulator
        ? {
            ...firebaseConfig,
            projectId: "demo-par-education",
            apiKey: "demo-key",
          }
        : firebaseConfig,
    );
    const auth = authentication.getAuth(app);
    const db = firestore.getFirestore(app);
    // Explicit local test mode cannot be activated on a deployed hostname.
    if (localEmulator) {
      authentication.connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
      firestore.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    return { auth, db, authentication, firestore };
  })();
  return promise;
}
