import {
  observeSession,
  login,
  register,
  logout,
  resetPassword,
} from "./auth/auth.js";
import { errorMessage, theme, toggleTheme, pageURL } from "./utils/helpers.js";
const $ = (id) => document.getElementById(id);
theme();
$("theme").addEventListener("click", toggleTheme);
let mode = "login";
let busy = false;
let ready = false;
let sessionUser = null;
let profileLoading = false;
let profileFailed = false;
function show(message, error = false) {
  $("login-status").textContent = message;
  $("login-status").classList.toggle("error", error);
}
function renderControls() {
  $("auth-description").textContent =
    sessionUser && profileFailed
      ? "Potrebno je dovršiti pripremu korisničkog profila."
      : sessionUser
        ? "Pristup se aktivira nakon administratorskog odobrenja."
        : mode === "register"
          ? "Izradite svoj korisnički račun."
          : "Unesite podatke svojeg PAR računa.";
  $("login-form").hidden = !!sessionUser || mode !== "login";
  $("register-form").hidden = !!sessionUser || mode !== "register";
  $("auth-switch").hidden = !!sessionUser;
  $("logout-pending").hidden = !sessionUser;
  $("retry-profile").hidden = !sessionUser || !profileFailed;
  $("login-submit").disabled =
    !ready || busy || profileLoading || !!sessionUser;
  $("register-submit").disabled =
    !ready || busy || profileLoading || !!sessionUser;
  $("switch-auth").disabled = busy;
  $("switch-auth").textContent =
    mode === "login" ? "Registriraj se" : "Prijavi se";
  $("auth-switch-label").textContent =
    mode === "login" ? "Nemate račun?" : "Već imate račun?";
  $("login-title").textContent =
    sessionUser && profileFailed
      ? "Profil nije dostupan"
      : sessionUser
        ? profileLoading
          ? "Priprema profila"
          : "Čeka odobrenje"
        : mode === "login"
          ? "Prijava u sustav"
          : "Registracija";
}
$("switch-auth").addEventListener("click", () => {
  if (busy || sessionUser) return;
  mode = mode === "login" ? "register" : "login";
  renderControls();
  show(
    mode === "register"
      ? "Izradite račun. Pristup odobrava administrator."
      : "Prijavite se svojom e-adresom i lozinkom.",
  );
  $(mode === "register" ? "register-name" : "email").focus();
});
$("show-password").addEventListener("click", (event) => {
  const input = $("password");
  input.type = input.type === "password" ? "text" : "password";
  const visible = input.type === "text";
  event.currentTarget.textContent = visible ? "Sakrij" : "Prikaži";
  event.currentTarget.setAttribute("aria-pressed", visible);
  event.currentTarget.setAttribute(
    "aria-label",
    visible ? "Sakrij lozinku" : "Prikaži lozinku",
  );
});
async function submitAuth(event, action) {
  event.preventDefault();
  if (!ready || busy || sessionUser || !event.currentTarget.reportValidity())
    return;
  busy = true;
  renderControls();
  show(mode === "register" ? "Registracija u tijeku…" : "Prijava u tijeku…");
  try {
    await action();
  } catch (error) {
    if (sessionUser) sessionError(error);
    else show(errorMessage(error), true);
  } finally {
    busy = false;
    renderControls();
  }
}
$("login-form").addEventListener("submit", (event) =>
  submitAuth(event, async () => {
    await login($("email").value, $("password").value, $("remember").checked);
    $("password").value = "";
  }),
);
$("register-form").addEventListener("submit", (event) =>
  submitAuth(event, async () => {
    await register(
      $("register-name").value,
      $("register-email").value,
      $("register-password").value,
      $("register-confirm").value,
    );
    $("register-password").value = "";
    $("register-confirm").value = "";
  }),
);
$("reset-password").addEventListener("click", async (event) => {
  if (!$("email").reportValidity()) {
    $("email").focus();
    return;
  }
  event.currentTarget.disabled = true;
  try {
    await resetPassword($("email").value);
    show(
      "Ako je račun dostupan, primit ćete poruku s uputama za obnovu lozinke.",
    );
  } catch (error) {
    show(errorMessage(error), true);
  } finally {
    $("reset-password").disabled = false;
  }
});
$("logout-pending").addEventListener("click", async () => {
  try {
    await logout();
  } catch (error) {
    show(errorMessage(error), true);
  }
});
$("retry-profile").addEventListener("click", () => location.reload());
function sessionError(error) {
  profileFailed = true;
  profileLoading = false;
  renderControls();
  show(
    error.code === "permission-denied" && sessionUser
      ? "Račun postoji, ali Firestore odbija spremanje ili učitavanje profila. Administrator treba objaviti aktualna pravila, a zatim pokušajte ponovno."
      : errorMessage(error),
    true,
  );
}
observeSession(({ user, profile, loading }) => {
  profileFailed = false;
  ready = true;
  sessionUser = user;
  profileLoading = loading;
  renderControls();
  if (loading) show("Priprema korisničkog profila…");
  else if (user && profile) location.replace(pageURL("./homepage.html"));
  else if (user)
    show(
      "Profil je spremljen i čeka odobrenje administratora. Vaš UID: " +
        user.uid +
        ".",
    );
  else
    show(
      mode === "register"
        ? "Izradite račun. Pristup odobrava administrator."
        : "Prijavite se svojom e-adresom i lozinkom.",
    );
}, sessionError).catch(sessionError);
renderControls();
