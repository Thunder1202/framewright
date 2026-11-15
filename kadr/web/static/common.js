// Small helpers shared by both pages. Plain JavaScript, no libraries.

// Call the server. Returns the JSON answer, or throws an Error with a friendly message.
async function api(method, url, body) {
  const options = { method: method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(url, options);
  } catch (e) {
    throw new Error("Cannot reach Kadr. Is the program still running in the terminal?");
  }
  let data = {};
  try { data = await response.json(); } catch (e) { /* not JSON */ }
  if (!response.ok) {
    throw new Error(data.error || ("The server answered with an error (" + response.status + ")."));
  }
  return data;
}

// Show a message box at the top of the page. kind: "bad" or "ok".
function showMessage(text, kind) {
  const box = document.getElementById("message");
  if (!box) return;
  box.textContent = text;
  box.className = "message show " + (kind || "bad");
  clearTimeout(showMessage.timer);
  if (kind === "ok") showMessage.timer = setTimeout(hideMessage, 4000);
}

function hideMessage() {
  const box = document.getElementById("message");
  if (box) box.className = "message";
}

// 83.4 -> "1:23.4"
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(1).padStart(4, "0");
  return m + ":" + s;
}

// Text for a status badge.
function statusLabel(status) {
  return { queued: "In queue", processing: "Processing", ready: "Ready", exporting: "Exporting", error: "Error" }[status] || status;
}
