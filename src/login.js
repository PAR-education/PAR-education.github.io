import { observeSession, login, logout, resetPassword } from "./auth/auth.js";
import { errorMessage, theme, toggleTheme, pageURL } from "./utils/helpers.js";
theme();
document.getElementById("theme").addEventListener("click", toggleTheme);
const form = document.getElementById("login-form");
const submit = document.getElementById("login-submit");
const status = document.getElementById("login-status");
let busy = false;
function show(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
document.getElementById("show-password").addEventListener("click", (event) => {
  const input = document.getElementById("password");
  input.type = input.type === "password" ? "text" : "password";
  const visible = input.type === "text";
  event.currentTarget.textContent = visible ? "Sakrij" : "Prikaži";
  event.currentTarget.setAttribute("aria-pressed", visible);
  event.currentTarget.setAttribute(
    "aria-label",
    visible ? "Sakrij lozinku" : "Prikaži lozinku",
  );
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  busy = true;
  submit.disabled = true;
  show("Prijava u tijeku…");
  try {
    await login(
      form.email.value,
      form.password.value,
      document.getElementById("remember").checked,
    );
    form.password.value = "";
  } catch (error) {
    show(errorMessage(error), true);
  } finally {
    busy = false;
    submit.disabled = false;
  }
});
document
  .getElementById("reset-password")
  .addEventListener("click", async (event) => {
    const email = document.getElementById("email");
    if (!email.reportValidity()) {
      email.focus();
      return;
    }
    event.currentTarget.disabled = true;
    try {
      await resetPassword(email.value);
      show(
        "Ako je račun dostupan, primit ćete poruku s uputama za obnovu lozinke.",
      );
    } catch (error) {
      show(errorMessage(error), true);
    } finally {
      document.getElementById("reset-password").disabled = false;
    }
  });
document
  .getElementById("logout-pending")
  .addEventListener("click", async () => {
    try {
      await logout();
    } catch (error) {
      show(errorMessage(error), true);
    }
  });
observeSession(
  ({ user, profile, loading }) => {
    submit.disabled = busy || loading || !!user;
    form.hidden = !!user;
    document.getElementById("logout-pending").hidden = !user;
    if (loading) show("Provjera dodijeljene uloge…");
    else if (user && profile) location.replace(pageURL("./homepage.html"));
    else if (user)
      show(
        "Račun je prijavljen, ali nema aktivan profil. Administrator treba dodijeliti ulogu u users/" +
          user.uid +
          ".",
        true,
      );
    else show("Prijavite se svojom e-adresom i lozinkom.");
  },
  (error) => {
    form.hidden = false;
    submit.disabled = false;
    show(errorMessage(error), true);
  },
).catch((error) => {
  show(errorMessage(error), true);
});
