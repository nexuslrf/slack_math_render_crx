"use strict";
const checkbox = document.querySelector("#enabled");
const status = document.querySelector("#status");
function showStatus(enabled) {
  status.textContent = enabled ? "On · Open or refresh Slack to start." : "Off · Slack shows the original messages.";
}
chrome.storage.local.get({ enabled: true }).then(({ enabled }) => {
  checkbox.checked = enabled;
  checkbox.disabled = false;
  showStatus(enabled);
}).catch(() => { status.textContent = "Could not load settings. Reopen this popup."; });
checkbox.addEventListener("change", async () => {
  checkbox.disabled = true;
  try {
    await chrome.storage.local.set({ enabled: checkbox.checked });
    showStatus(checkbox.checked);
  } catch {
    checkbox.checked = !checkbox.checked;
    status.textContent = "Could not save. Please try again.";
  } finally {
    checkbox.disabled = false;
  }
});
