document.getElementById("open-practice").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("practice/practice.html") });
});

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.local.get(["apiKey"], (s) => {
  if (!s.apiKey) {
    document.getElementById("key-warning").hidden = false;
  }
});
