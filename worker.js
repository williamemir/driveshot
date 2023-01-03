const GDRIVE_UPLOAD_API =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";

/* global ClipboardItem */
("use strict");

chrome.runtime.onConnect.addListener((p) => {
  p.onDisconnect.addListener(() => {
    console.log("port is closed", p.name);
  });
});

const notify = (e) =>
  chrome.notifications.create({
    type: "basic",
    iconUrl: "/data/icons/128x128.png",
    title: chrome.runtime.getManifest().name,
    message: e.message || e,
  });

function capture(request) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        return reject(lastError);
      }

      if (!request) {
        return fetch(dataUrl)
          .then((r) => r.blob())
          .then(resolve, reject);
      }

      const left = request.left * request.devicePixelRatio;
      const top = request.top * request.devicePixelRatio;
      const width = request.width * request.devicePixelRatio;
      const height = request.height * request.devicePixelRatio;

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");

      fetch(dataUrl)
        .then((r) => r.blob())
        .then(async (blob) => {
          const prefs = await new Promise((resolve) =>
            chrome.storage.local.get(
              {
                quality: 0.95,
              },
              resolve
            )
          );

          const img = await createImageBitmap(blob);

          if (width && height) {
            ctx.drawImage(img, left, top, width, height, 0, 0, width, height);
          } else {
            ctx.drawImage(img, 0, 0);
          }
          resolve(
            await canvas.convertToBlob({
              type: "image/png",
              quality: prefs.quality,
            })
          );
        })
        .catch(reject);
    });
  });
}

function save(blob, tab) {
  chrome.storage.local.get(
    {
      timestamp: true,
      "save-disk": true,
      "save-clipboard": false,
      "save-gdrive": true,
      folderId: "no-folder",
      driveId: "no-shared-drive",
      urlPrefix: "https://drive.google.com/uc?id=",
    },
    (prefs) => {
      let filename = tab.title;
      if (prefs.timestamp) {
        const time = new Date();
        filename = filename +=
          " " + time.toLocaleDateString() + " " + time.toLocaleTimeString();
      }

      const reader = new FileReader();
      reader.onload = () => {
        // save to gdrive
        if (prefs["save-gdrive"]){
          uploadFileToDrive(filename, "image/png", blob, tab, prefs);
        }        
        // save to clipboard
        if (prefs["save-clipboard"]) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (href) => {
              try {
                const blob = await fetch(href).then((r) => r.blob());
                await navigator.clipboard.write([
                  new ClipboardItem({
                    "image/png": blob,
                  }),
                ]);
              } catch (e) {
                console.warn(e);
                alert(e.message);
              }
            },
            args: [reader.result],
          });
        }
        // save to disk
        if (prefs["save-disk"]) {
          chrome.downloads.download(
            {
              url: reader.result,
              filename: filename + ".png",
              saveAs: false,
            },
            () => {
              const lastError = chrome.runtime.lastError;
              if (lastError) {
                chrome.downloads.download(
                  {
                    url: reader.result,
                    filename:
                      filename.replace(
                        /[`~!@#$%^&*()_|+\-=?;:'",.<>{}[\]\\/]/gi,
                        "-"
                      ) + ".png",
                  },
                  () => {
                    const lastError = chrome.runtime.lastError;
                    if (lastError) {
                      chrome.downloads.download({
                        url: reader.result,
                        filename: "image.png",
                      });
                    }
                  }
                );
              }
            }
          );
        }
      };
      reader.readAsDataURL(blob);
    }
  );
}

async function matrix(tab) {
  const tabId = tab.id;
  const prefs = await new Promise((resolve) =>
    chrome.storage.local.get(
      {
        delay: 600,
        offset: 50,
        quality: 0.95,
      },
      resolve
    )
  );
  prefs.delay = Math.max(
    prefs.delay,
    1000 / chrome.tabs.MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND || 2
  );

  const r = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      self.port = chrome.runtime.connect({
        name: "matrix",
      });

      return {
        width: Math.max(
          document.body.scrollWidth,
          document.documentElement.scrollWidth
        ),
        height: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        ),
        w: document.documentElement.clientWidth,
        h: document.documentElement.clientHeight,
        ratio: window.devicePixelRatio,
      };
    },
  });
  const { ratio, width, height, w, h } = r[0].result;
  const canvas = new OffscreenCanvas(width * ratio, height * ratio);
  const ctx = canvas.getContext("2d");

  chrome.action.setBadgeText({ tabId, text: "R" });

  const mx =
    Math.ceil((width - prefs.offset) / (w - prefs.offset)) *
    Math.ceil((height - prefs.offset) / (h - prefs.offset));
  let p = 0;

  for (let x = 0; x < width - prefs.offset; x += w - prefs.offset) {
    for (let y = 0; y < height - prefs.offset; y += h - prefs.offset) {
      p += 1;
      chrome.action.setBadgeText({
        tabId,
        text: ((p / mx) * 100).toFixed(0) + "%",
      });

      // move to the location
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (x, y) => window.scroll(x, y),
        args: [x, y],
      });
      // wait
      await new Promise((resolve) => setTimeout(resolve, prefs.delay));
      // read with delay
      const [
        {
          result: [i, j],
        },
      ] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => [
          document.body.scrollLeft || document.documentElement.scrollLeft,
          document.body.scrollTop || document.documentElement.scrollTop,
        ],
      });

      // capture
      await chrome.tabs.update(tabId, {
        highlighted: true,
      });
      await chrome.windows.update(tab.windowId, {
        focused: true,
      });

      const blob = await capture();
      // write
      const img = await createImageBitmap(blob);
      ctx.drawImage(
        img,
        0,
        0,
        img.width,
        img.height,
        i * ratio,
        j * ratio,
        img.width,
        img.height
      );
    }
  }
  chrome.action.setBadgeText({ tabId, text: "Wait..." });
  const blob = await canvas.convertToBlob({
    type: "image/png",
    quality: prefs.quality,
  });
  chrome.action.setBadgeText({ tabId, text: "" });
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      try {
        self.port.disconnect();
      } catch (e) {}
    },
  });
  return blob;
}

function setMetaData(fileName, mimeType, folder_Id, drive_Id) {
  if (folder_Id === "no-folder") {
    return {
      name: fileName,
      mimeType: mimeType,
    };
  }
  if (drive_Id === "no-shared-drive") {
    return {
      name: fileName,
      mimeType: mimeType,
      parents: [folder_Id], // Folder Id to save in shared drive
    };
  }
  return {
    name: fileName,
    mimeType: mimeType,
    parents: [folder_Id], // Folder Id to save in shared drive
    driveId: drive_Id, //shared drive id
  };
}

function uploadFileToDrive(fileName, mimeType, fileBlob, tab, prefs) {
  console.log(prefs["urlPrefix"]);
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    let form = new FormData();
    let metadata = setMetaData(
      fileName,
      mimeType,
      prefs["folderId"],
      prefs["driveId"]
    );
    console.log(prefs["urlPrefix"]);
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    form.append("file", fileBlob);
    let init = {
      method: "POST",
      async: false,
      headers: {
        Authorization: "Bearer " + token,
      },
      body: form,
    };
    fetch(GDRIVE_UPLOAD_API, init)
      .then((response) => response.json())
      .then(function (data) {
        console.log("screenshot successfully uploaded to gdrive");
        console.log(prefs["urlPrefix"]);
        var GDRIVE_BASE_URL = prefs["urlPrefix"] == "" ? "https://drive.google.com/uc?id=" : prefs["urlPrefix"];
        urlImgDataDog = GDRIVE_BASE_URL + data.id;
        console.log("Markdown URL: " + urlImgDataDog);
        if (prefs["save-gdrive"]) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (href) => {
              console.log("inicio funcion asincrona copia url a clipboard");
              console.log(href);
              try {
                await navigator.clipboard.writeText(href);
              } catch (e) {
                console.warn(e);
                alert(e.message);
              }
            },
            args: [urlImgDataDog],
          });
        }
      });
  });
}

function onCommand(cmd, tab) {
  if (cmd === "capture-visual") {
    capture()
      .then((blob) => save(blob, tab))
      .catch((e) => {
        console.warn(e);
        notify(e.message || e);
      });
  } else if (cmd === "capture-portion") {
    chrome.scripting.insertCSS(
      {
        target: { tabId: tab.id },
        files: ["data/inject/inject.css"],
      },
      () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          return notify(lastError);
        }
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["data/inject/inject.js"],
        });
      }
    );
  } else if (cmd === "capture-entire") {
    matrix(tab)
      .then((a) => save(a, tab))
      .catch((e) => {
        console.warn(e);
        notify(e.message || e);
      });
  }
}

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === "captured") {
    capture(request)
      .then((a) => save(a, sender.tab))
      .catch((e) => {
        console.warn(e);
        notify(e.message || e);
      });
  }
  if (request.method === "popup") {
    onCommand(request.cmd, request.tab);

    response(true);
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "captureArea") {
    let captureTab = {
      id: tab.id,
      title: tab.title,
      windowId: tab.windowId,
    };
    onCommand("capture-portion", captureTab);
  }
});
