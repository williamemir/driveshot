"use strict";

const toast = document.getElementById("toast");

function restore() {
  chrome.storage.local.get(
    {
      delay: 600,
      offset: 50,
      timestamp: true,
      saveAs: false,
      folderId: "no-folder",
      driveId: "no-shared-drive",
      urlPrefix: "https://drive.google.com/uc?id=",
    },
    (prefs) => {
      document.getElementById("delay").value = prefs.delay;
      document.getElementById("offset").value = prefs.offset;
      document.getElementById("timestamp").checked = prefs.timestamp;
      document.getElementById("folderid").value = prefs.folderId;
      document.getElementById("driveid").value = prefs.driveId;
      document.getElementById("urlprefixOther").value = prefs.urlPrefix;
    }
  );
}

function getUrlPrefix(){
  var urlprefixRadio = document.getElementsByName('urlprefix');              
    for(var i = 0; i < urlprefixRadio.length; i++) {
        if(urlprefixRadio[i].checked)
          if (i == 3){
            var urlprefix_other = document.getElementById('urlprefixOther').value;
            urlprefix_other = urlprefix_other == "" ? urlprefixRadio[0].value : urlprefix_other;
            return urlprefix_other;
            }
          else {
            return urlprefixRadio[i].value;
            }
    }
}

function save() {
  const delay = Math.max(document.getElementById("delay").value, 100);
  const offset = Math.max(document.getElementById("offset").value, 10);
  const timestamp = document.getElementById("timestamp").checked;
  const folderId = document.getElementById("folderid").value;
  const driveId = document.getElementById("driveid").value;
  const urlPrefix = getUrlPrefix();
  

  chrome.storage.local.set(
    {
      delay,
      offset,
      timestamp,
      folderId,
      driveId,
      urlPrefix,
    },
    () => {
      toast.textContent = "Options saved.";
      setTimeout(() => (toast.textContent = ""), 2000);
      restore();
    }
  );
}

document.addEventListener("DOMContentLoaded", restore);
document.getElementById("save").addEventListener("click", save);

// reset
document.getElementById("reset").addEventListener("click", (e) => {
  if (e.detail === 1) {
    toast.textContent = "Double-click to reset!";
    window.setTimeout(() => (toast.textContent = ""), 2000);
  } else {
    localStorage.clear();
    chrome.storage.local.clear(() => {
      chrome.runtime.reload();
      window.close();
    });
  }
});
