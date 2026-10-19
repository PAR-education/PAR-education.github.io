import { openDialog, closeDialog } from "./dialog.js";
import { escapeHTML as e, errorMessage } from "../utils/helpers.js";
import { noticeAudiences, canSendAnnouncement } from "../utils/notices.js";
export function showAnnouncement(context, onSaved) {
  if (!canSendAnnouncement(context.profile.role)) return;
  openDialog(
    "Pošalji obavijest",
    `<form id="announcement-form"><div class="form-grid"><div class="field wide"><label for="notice-audience">Primatelji</label><select id="notice-audience" required><option value="">Odaberite primatelje</option>${Object.entries(
      noticeAudiences,
    )
      .map(([value, label]) => `<option value="${value}">${e(label)}</option>`)
      .join(
        "",
      )}</select></div><div class="field wide"><label for="notice-title">Naslov</label><input id="notice-title" maxlength="200" required></div><div class="field wide"><label for="notice-message">Poruka</label><textarea id="notice-message" maxlength="2000" rows="5" required></textarea></div></div><p class="muted">Obavijest će biti vidljiva odabranoj grupi unutar aplikacije.</p><div id="announcement-error" role="alert"></div><div class="form-actions"><button type="button" class="button" id="notice-cancel">Odustani</button><button class="button primary" type="submit">Pošalji obavijest</button></div></form>`,
  );
  const form = document.getElementById("announcement-form");
  document
    .getElementById("notice-cancel")
    .addEventListener("click", closeDialog);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    if (button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    try {
      await context.repository.save("notifications", {
        audience: form.querySelector("#notice-audience").value,
        title: form.querySelector("#notice-title").value.trim(),
        message: form.querySelector("#notice-message").value.trim(),
      });
      if (document.getElementById("announcement-form") !== form) return;
      closeDialog();
      await onSaved?.();
    } catch (error) {
      if (form.isConnected)
        form.querySelector("#announcement-error").textContent =
          errorMessage(error);
    } finally {
      button.disabled = false;
    }
  });
}
