import { startApplication } from "./main.js";
import { demoData } from "./data/demoData.js";
import { roles } from "./auth/permissions.js";
import { DemoRecords } from "./services/demo.js";
const data = await demoData();
const banner = document.createElement("div");
banner.className = "demo-notice";
banner.innerHTML =
  '<span>OGLEDNA SESIJA · Izmišljeni podaci. Promjene se ne šalju u Firebase i nestaju nakon ponovnog učitavanja.</span><label>Uloga <select id="demo-role"></select></label>';
document.querySelector(".workspace").prepend(banner);
const selector = document.getElementById("demo-role");
for (const [id, name] of Object.entries(roles)) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = name;
  selector.append(option);
}
async function selectRole() {
  const role = selector.value;
  const user = { uid: `demo-${role}`, email: `${role}@example.test` };
  const profile = data.users.find((row) => row.id === user.uid);
  await startApplication(
    user,
    profile,
    new DemoRecords(data, user, profile),
    true,
  );
}
selector.addEventListener("change", selectRole);
await selectRole();
