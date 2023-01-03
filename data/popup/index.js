"use strict";

let tab;

document.addEventListener("click", (e) => {
  const cmd = e.target.dataset.cmd;
  if (cmd) {
    chrome.runtime.sendMessage(
      {
        method: "popup",
        cmd,
        tab: {
          id: tab.id,
          title: tab.title,
          windowId: tab.windowId,
        },
      },
      window.close
    );
  }
});

chrome.tabs.query(
  {
    active: true,
    currentWindow: true,
  },
  ([t]) => {
    tab = t;
    if (
      tab.url.startsWith("chrome") ||
      tab.url.startsWith("mozilla") ||
      tab.url.startsWith("about")
    ) {
      document.body.dataset.disabled = true;
    }
  }
);

chrome.storage.local.get(
  {
    "save-clipboard": false,
    "save-disk": true,
    "save-gdrive": true,
  },
  (prefs) => {
    document.getElementById("save-clipboard").checked = prefs["save-clipboard"];
    document.getElementById("save-disk").checked = prefs["save-disk"];
    document.getElementById("save-gdrive").checked = prefs["save-gdrive"];
  }
);

document.getElementById("save-clipboard").onchange = (e) => {
  chrome.storage.local.set({
    "save-clipboard": e.target.checked,
    "save-gdrive": !e.target.checked,
  });
  document.getElementById("save-gdrive").checked = !e.target.checked;
};
document.getElementById("save-gdrive").onchange = (e) => {
  chrome.storage.local.set({
    "save-gdrive": e.target.checked,
    "save-clipboard": !e.target.checked,
  });
  document.getElementById("save-clipboard").checked = !e.target.checked;
};
document.getElementById("save-disk").onchange = (e) =>
  chrome.storage.local.set({
    "save-disk": e.target.checked,
  });
