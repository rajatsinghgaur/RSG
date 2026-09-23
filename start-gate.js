(() => {
  "use strict";
  const gate = document.getElementById("startGate");
  const button = document.getElementById("startButton");
  if (!gate || !button) return;
  const key = "rsg-start-gate-v1";
  try {
    if (sessionStorage.getItem(key) === "started") {
      gate.hidden = true;
      return;
    }
  } catch (_) {}
  button.addEventListener("click", () => {
    gate.hidden = true;
    try { sessionStorage.setItem(key, "started"); } catch (_) {}
  }, { once: true });
})();
