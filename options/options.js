const els = {
  apiKey: document.getElementById("api-key"),
  model: document.getElementById("model"),
  fillerWords: document.getElementById("filler-words"),
  paceLow: document.getElementById("pace-low"),
  paceHigh: document.getElementById("pace-high"),
  save: document.getElementById("save"),
  savedMsg: document.getElementById("saved-msg"),
  clearHistory: document.getElementById("clear-history")
};

chrome.storage.local.get(
  ["apiKey", "model", "fillerWords", "paceLow", "paceHigh"],
  (s) => {
    els.apiKey.value = s.apiKey || "";
    els.model.value = s.model || "claude-sonnet-4-6";
    els.fillerWords.value = s.fillerWords || "";
    els.paceLow.value = s.paceLow || 130;
    els.paceHigh.value = s.paceHigh || 160;
  }
);

els.save.addEventListener("click", () => {
  chrome.storage.local.set(
    {
      apiKey: els.apiKey.value.trim(),
      model: els.model.value,
      fillerWords: els.fillerWords.value.trim(),
      paceLow: Number(els.paceLow.value) || 130,
      paceHigh: Number(els.paceHigh.value) || 160
    },
    () => {
      els.savedMsg.hidden = false;
      setTimeout(() => (els.savedMsg.hidden = true), 1800);
    }
  );
});

els.clearHistory.addEventListener("click", () => {
  if (!confirm("Clear all saved practice history? This can't be undone.")) return;
  chrome.storage.local.set({ history: [] });
});
