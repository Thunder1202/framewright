// Caption editor: video player + editable lines + style picker + export.
// Every edit is sent to the server, which answers with the new list of lines.

const jobId = new URLSearchParams(location.search).get("id");
const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const cap = document.getElementById("cap");
const capText = document.getElementById("capText");
const linesBox = document.getElementById("lines");
const titleCap = document.getElementById("titleCap");
const titleText = document.getElementById("titleText");
const titleInput = document.getElementById("titleInput");
const titleSeconds = document.getElementById("titleSeconds");

let job = null;            // job status from the server
let info = null;           // styles and settings from the server
let lines = [];            // the caption lines
let styleId = localStorage.getItem("kadr-style") || "";
let selected = { line: -1, word: -1 };   // the word the user clicked last
let shownLine = -2;        // which line the overlay currently shows
let shownWord = -2;
let exportStarted = 0;     // time of the export we are waiting for
let size = "medium";       // text size: small, medium, large, xl
let history = { undo: 0, redo: 0 };   // how many Undo / Redo steps the server has
let shownTitle = "";       // what the title overlay currently shows
let busy = false;          // an edit is on its way to the server

const LINGER = 0.25;       // must match display_times() in engine/captions.py
const NUDGE = 0.1;         // seconds per click on − / +

// ---------- loading ----------

async function start() {
  if (!jobId) { showMessage("No video chosen. Go back to the list."); return; }
  try {
    info = await api("GET", "/api/info");
    if (!info.styles[styleId]) styleId = Object.keys(info.styles)[0];
    loadFonts();
    drawStyleCards();
    await waitUntilReady();
  } catch (e) {
    showMessage(e.message);
  }
}

// Poll the job until processing is finished, then load the captions and video.
async function waitUntilReady() {
  job = await api("GET", "/api/jobs/" + jobId);
  document.getElementById("title").textContent = job.name;
  setStatus(job);
  if (job.status === "queued" || job.status === "processing") {
    showMessage("Still working on this video: " + job.stage + " (" + Math.round(job.progress * 100) + "%)", "ok");
    setTimeout(function () { waitUntilReady().catch(function (e) { showMessage(e.message); }); }, 1500);
    return;
  }
  if (job.status === "error") { showMessage(job.error); return; }
  hideMessage();
  applyJobSettings(job);
  video.src = "/api/jobs/" + jobId + "/video";
  const data = await api("GET", "/api/jobs/" + jobId + "/captions");
  lines = data.lines;
  setHistory(data.history);
  drawLines();
  document.getElementById("dlSrtTop").href = "/api/jobs/" + jobId + "/download/srt";
  if (job.has_output) showDownloads();
  if (job.status === "exporting") { exportStarted = Date.now() / 1000 - 1; watchExport(); }
}

const LANG_NAMES = { en: "English", ru: "Russian", uz: "Uzbek" };

// Put the saved choices of this video (style, size, title, words per line) into the controls.
function applyJobSettings(j) {
  const look = j.look || {};
  if (look.style && info.styles[look.style]) { styleId = look.style; drawStyleCards(); }
  if (look.size) size = look.size;
  document.getElementById("vertical").checked = !!look.vertical;
  titleInput.value = look.title || "";
  if (look.title_seconds !== undefined) titleSeconds.value = String(look.title_seconds);
  if (!titleSeconds.value) titleSeconds.value = "3";
  drawSizes();
  const options = j.options || {};
  document.getElementById("words").value = options.max_words ? String(options.max_words) : "";
  if (options.translate_to) {
    const badge = document.getElementById("modeBadge");
    badge.style.display = "inline-block";
    badge.textContent = "Translated: " + (LANG_NAMES[options.language] || options.language) + " → " +
      (LANG_NAMES[options.translate_to] || options.translate_to);
    const orig = document.getElementById("dlOrigSrt");
    orig.style.display = "inline-block";
    orig.href = "/api/jobs/" + jobId + "/download/original_srt";
  }
}

// Remember the look of this video on the server (a moment after the last change).
function saveLook() {
  clearTimeout(saveLook.timer);
  saveLook.timer = setTimeout(function () {
    api("POST", "/api/jobs/" + jobId + "/look", lookPayload()).catch(function () {});
  }, 600);
}

function lookPayload() {
  return {
    style: styleId, size: size, vertical: document.getElementById("vertical").checked,
    title: titleInput.value, title_seconds: parseFloat(titleSeconds.value) || 0,
  };
}

function drawSizes() {
  document.querySelectorAll("#sizes button").forEach(function (b) {
    b.classList.toggle("on", b.dataset.size === size);
  });
}

function setHistory(h) {
  history = h || { undo: 0, redo: 0 };
  const undo = document.getElementById("undo");
  const redo = document.getElementById("redo");
  undo.disabled = !history.undo;
  redo.disabled = !history.redo;
  undo.textContent = "↶ Undo" + (history.undo ? " (" + history.undo + ")" : "");
  redo.textContent = "↷ Redo" + (history.redo ? " (" + history.redo + ")" : "");
}

function setStatus(j) {
  const badge = document.getElementById("status");
  badge.className = "badge " + j.status;
  badge.textContent = statusLabel(j.status);
}

// Register the bundled fonts with the browser so the preview uses the real ones.
function loadFonts() {
  const seen = {};
  Object.values(info.styles).forEach(function (s) {
    if (seen[s.font]) return;
    seen[s.font] = true;
    const face = new FontFace(fontName(s), "url(/fonts/" + encodeURIComponent(s.font) + ")");
    face.load().then(function (f) { document.fonts.add(f); shownLine = -2; }).catch(function () {});
  });
}

function fontName(style) { return "cap-" + style.font.replace(/[^a-zA-Z0-9]/g, ""); }

// ---------- style picker ----------

function drawStyleCards() {
  const box = document.getElementById("styles");
  box.innerHTML = "";
  Object.values(info.styles).forEach(function (s) {
    const card = document.createElement("div");
    card.className = "style-card" + (s.id === styleId ? " on" : "");
    const demo = document.createElement("span");
    demo.className = "demo";
    demo.style.fontFamily = '"' + fontName(s) + '", sans-serif';
    demo.style.color = s.text_color;
    demo.style.textTransform = s.uppercase ? "uppercase" : "none";
    if (s.outline_width > 0) {
      demo.style.webkitTextStroke = "3px " + s.outline_color;
      demo.style.paintOrder = "stroke fill";
    }
    const a = document.createElement("span");
    a.textContent = "Salom ";
    const b = document.createElement("span");
    b.textContent = "дунё";
    b.style.color = s.active_color;
    if (s.box === "line") { demo.style.background = s.box_color; demo.style.padding = "2px 8px"; demo.style.borderRadius = "7px"; }
    if (s.box === "word") { b.style.background = s.box_color; b.style.padding = "0 5px"; b.style.borderRadius = "5px"; }
    demo.append(a, b);
    const label = document.createElement("span");
    label.className = "lbl";
    label.textContent = s.label;
    card.append(demo, label);
    card.onclick = function () {
      styleId = s.id;
      localStorage.setItem("kadr-style", styleId);
      drawStyleCards();
      saveLook();
      shownLine = -2;      // force the overlay to redraw
    };
    box.append(card);
  });
}

// ---------- the caption overlay on top of the video (live preview) ----------

// Put the overlay exactly over the picture.
function placeOverlay() {
  overlay.style.left = video.offsetLeft + "px";
  overlay.style.top = video.offsetTop + "px";
  overlay.style.width = video.clientWidth + "px";
  overlay.style.height = (video.clientHeight) + "px";
}

// Which line is on screen at time t? Returns its index or -1.
function lineAt(t) {
  for (let i = 0; i < lines.length; i++) {
    let end = lines[i].end + LINGER;
    if (i + 1 < lines.length) end = Math.min(end, lines[i + 1].start);
    if (t >= lines[i].start && t < end) return i;
    if (t < lines[i].start) break;
  }
  return -1;
}

// Which word of the line is being spoken at time t?
function wordAt(line, t) {
  let k = 0;
  for (let i = 0; i < line.words.length; i++) if (t >= line.words[i].start) k = i;
  return k;
}

// Draw the caption for the current video time using the chosen style.
function drawOverlay() {
  const t = video.currentTime;
  const li = lineAt(t);
  const wi = li >= 0 ? wordAt(lines[li], t) : -1;
  if (li !== shownLine || wi !== shownWord) {
    markCurrent(li, wi);
    shownLine = li;
    shownWord = wi;
    capText.innerHTML = "";
    if (li < 0) { cap.style.display = "none"; return; }
    const s = info.styles[styleId];
    const vw = video.videoWidth || 1080, vh = video.videoHeight || 1920;
    const w = video.clientWidth, h = video.clientHeight;
    const portrait = vh > vw;
    // Same maths as engine/ass.py: sizes are for a 1080-wide video.
    const k = Math.min(w, h) / 1080;
    const fontSize = s.font_size * (info.sizes[size] || 1) * k;   // ASS font size in screen pixels
    const em = fontSize * s.em_ratio;           // the matching CSS font size
    cap.style.display = "block";
    cap.className = "cap" + (s.box === "line" ? " box-line" : "");
    cap.style.fontFamily = '"' + fontName(s) + '", sans-serif';
    cap.style.fontSize = em + "px";
    cap.style.color = s.text_color;
    cap.style.textTransform = s.uppercase ? "uppercase" : "none";
    cap.style.maxWidth = (portrait ? Math.min(s.max_width, 84) : s.max_width) + "%";
    const padY = s.box !== "none" ? s.box_padding_y * k : 0;
    const padX = s.box !== "none" ? s.box_padding_x * k : 0;
    cap.style.lineHeight = (fontSize * 1.14 + 2 * padY) + "px";
    capText.style.webkitTextStroke = s.outline_width > 0 ? (2 * s.outline_width * k) + "px " + s.outline_color : "0";
    capText.style.paintOrder = "stroke fill";
    capText.style.textShadow = s.shadow > 0 ? (s.shadow * k) + "px " + (s.shadow * k) + "px 0 rgba(0,0,0,.6)" : "none";
    if (s.box === "line") {
      capText.style.background = hexToRgba(s.box_color, s.box_opacity);
      capText.style.padding = padY + "px " + padX + "px";
      capText.style.borderRadius = (s.box_radius * k) + "px";
    } else {
      capText.style.background = "none";
      capText.style.padding = "0";
    }
    const margin = Math.max(s.margin, portrait ? (s.position === "top" ? 10 : 14) : 0);
    cap.style.top = cap.style.bottom = "auto";
    cap.style.transform = "translateX(-50%)";
    if (s.position === "top") cap.style.top = margin + "%";
    else if (s.position === "middle") { cap.style.top = "50%"; cap.style.transform = "translate(-50%, -50%)"; }
    else cap.style.bottom = margin + "%";

    lines[li].words.forEach(function (word, i) {
      const span = document.createElement("span");
      span.textContent = word.word;
      if (i === wi) {
        span.style.color = s.active_color;
        if (s.box === "word") {
          span.style.background = hexToRgba(s.box_color, s.box_opacity);
          span.style.borderRadius = (s.box_radius * k) + "px";
          span.style.boxShadow = "0 0 0 " + padY + "px " + hexToRgba(s.box_color, s.box_opacity);
        }
      }
      capText.append(span);
      if (i + 1 < lines[li].words.length) capText.append(" ");
    });
  }
}

// Draw the title text (if any) for the current video time.
function drawTitle() {
  const text = titleInput.value.trim();
  const seconds = parseFloat(titleSeconds.value) || 0;
  const visible = text && (seconds <= 0 || video.currentTime < seconds);
  const key = visible ? [text, styleId, size, video.clientWidth, video.clientHeight].join("|") : "";
  if (key === shownTitle) return;
  shownTitle = key;
  if (!visible) { titleCap.style.display = "none"; return; }
  const s = info.styles[styleId];
  const vw = video.videoWidth || 1080, vh = video.videoHeight || 1920;
  const w = video.clientWidth, h = video.clientHeight;
  const portrait = vh > vw;
  const k = Math.min(w, h) / 1080;
  const fontSize = s.font_size * (info.sizes[size] || 1) * 0.85 * k;    // TITLE_SCALE in engine/ass.py
  const padY = s.box !== "none" ? s.box_padding_y * k : 0;
  const padX = s.box !== "none" ? s.box_padding_x * k : 0;
  titleCap.style.display = "block";
  titleCap.className = "cap" + (s.box !== "none" ? " box-line" : "");
  titleCap.style.fontFamily = '"' + fontName(s) + '", sans-serif';
  titleCap.style.fontSize = (fontSize * s.em_ratio) + "px";
  titleCap.style.lineHeight = (fontSize * 1.14 + 2 * padY) + "px";
  titleCap.style.color = s.text_color;
  titleCap.style.textTransform = s.uppercase ? "uppercase" : "none";
  titleCap.style.maxWidth = (portrait ? Math.min(s.max_width, 84) : s.max_width) + "%";
  titleText.textContent = text;
  titleText.style.webkitTextStroke = s.outline_width > 0 ? (2 * s.outline_width * k) + "px " + s.outline_color : "0";
  titleText.style.paintOrder = "stroke fill";
  titleText.style.textShadow = s.shadow > 0 ? (s.shadow * k) + "px " + (s.shadow * k) + "px 0 rgba(0,0,0,.6)" : "none";
  if (s.box !== "none") {
    titleText.style.background = hexToRgba(s.box_color, s.box_opacity);
    titleText.style.padding = padY + "px " + padX + "px";
    titleText.style.borderRadius = (s.box_radius * k) + "px";
  } else {
    titleText.style.background = "none";
    titleText.style.padding = "0";
  }
  titleCap.style.top = titleCap.style.bottom = "auto";
  if (s.position === "top") titleCap.style.bottom = (portrait ? 14 : 8) + "%";
  else titleCap.style.top = (portrait ? 10 : 7) + "%";
}

function hexToRgba(hex, opacity) {
  const n = parseInt(hex.replace("#", ""), 16);
  return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + (opacity / 100) + ")";
}

// Highlight the current line and word in the list on the right.
function markCurrent(li, wi) {
  linesBox.querySelectorAll(".line.now, .w.now").forEach(function (el) { el.classList.remove("now"); });
  if (li < 0) return;
  const row = linesBox.children[li];
  if (!row) return;
  row.classList.add("now");
  const editing = document.activeElement && document.activeElement.classList.contains("text");
  if (!editing) {
    const word = row.querySelectorAll(".w")[wi];
    if (word) word.classList.add("now");
    if (!video.paused) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

// Redraw about 60 times a second while the page is open.
function tick() {
  if (info && lines.length) { placeOverlay(); drawOverlay(); drawTitle(); }
  requestAnimationFrame(tick);
}

// ---------- the list of lines ----------

function drawLines() {
  const scroll = linesBox.scrollTop;
  linesBox.innerHTML = "";
  lines.forEach(function (line, index) { linesBox.append(lineElement(line, index)); });
  linesBox.scrollTop = scroll;
  shownLine = -2;
}

function smallButton(text, title, onclick) {
  const b = document.createElement("button");
  b.className = "small";
  b.textContent = text;
  b.title = title;
  b.onclick = onclick;
  return b;
}

// Build one row: time buttons, editable text, tools.
function lineElement(line, index) {
  const row = document.createElement("div");
  row.className = "line";

  const times = document.createElement("div");
  times.className = "times";
  [["start", "Start"], ["end", "End"]].forEach(function (pair) {
    const key = pair[0];
    const minus = smallButton("−", pair[1] + " 0.1 s earlier", function () { edit({ op: "nudge", line: index, [key]: -NUDGE }); });
    const plus = smallButton("+", pair[1] + " 0.1 s later", function () { edit({ op: "nudge", line: index, [key]: NUDGE }); });
    const label = document.createElement("span");
    label.textContent = formatTime(line[key]);
    label.title = pair[1];
    times.append(minus, label, plus);
  });

  const text = document.createElement("div");
  text.className = "text";
  text.contentEditable = "true";
  text.spellcheck = false;
  line.words.forEach(function (word, wi) {
    const span = document.createElement("span");
    span.className = "w" + (selected.line === index && selected.word === wi ? " sel" : "");
    span.textContent = word.word;
    span.onclick = function () {
      video.currentTime = word.start + 0.01;
      selected = { line: index, word: wi };
      linesBox.querySelectorAll(".w.sel").forEach(function (el) { el.classList.remove("sel"); });
      span.classList.add("sel");
    };
    text.append(span);
    if (wi + 1 < line.words.length) text.append(" ");
  });
  text.onkeydown = function (e) {
    if (e.key === "Enter") { e.preventDefault(); text.blur(); }
    if (e.key === "Escape") { text.textContent = line.text; text.blur(); }
  };
  text.onblur = function () {
    const now = text.innerText.replace(/\s+/g, " ").trim();
    if (now !== line.text) edit({ op: "text", line: index, text: now });
  };

  const tools = document.createElement("div");
  tools.className = "tools";
  tools.append(
    smallButton("Split", "Start a new line at the word you clicked", function () {
      if (selected.line !== index || selected.word < 1) {
        showMessage("First click the word that should start the new line (not the first word), then press Split.");
        return;
      }
      edit({ op: "split", line: index, word: selected.word });
    }),
    smallButton("Merge ↓", "Join this line with the next one", function () { edit({ op: "merge", line: index }); }),
    smallButton("+", "Add a new line after this one", function () { edit({ op: "insert", line: index, text: "New line" }); }),
    smallButton("✕", "Delete this line", function () { edit({ op: "delete", line: index }); })
  );
  if (index === lines.length - 1) tools.children[1].disabled = true;

  row.append(times, text, tools);
  return row;
}

// Send one edit to the server and show the result.
async function edit(action) {
  if (busy) return;
  busy = true;
  try {
    const result = await api("POST", "/api/jobs/" + jobId + "/edit", action);
    lines = result.lines;
    setHistory(result.history);
    selected = { line: -1, word: -1 };
    hideMessage();
    drawLines();
  } catch (e) {
    showMessage(e.message);
    drawLines();
  }
  busy = false;
}

// ---------- export ----------

async function startExport() {
  try {
    document.getElementById("export").disabled = true;
    exportStarted = Date.now() / 1000 - 1;
    await api("POST", "/api/jobs/" + jobId + "/export", lookPayload());
    document.getElementById("downloads").style.display = "none";
    watchExport();
  } catch (e) {
    document.getElementById("export").disabled = false;
    showMessage(e.message);
  }
}

// Poll the job while the export is running.
async function watchExport() {
  const bar = document.getElementById("exportBar");
  const note = document.getElementById("exportNote");
  bar.style.display = "block";
  try {
    const j = await api("GET", "/api/jobs/" + jobId);
    setStatus(j);
    if (j.status === "exporting") {
      bar.firstElementChild.style.width = Math.round(j.progress * 100) + "%";
      note.textContent = j.stage + " " + Math.round(j.progress * 100) + "%";
      setTimeout(watchExport, 700);
      return;
    }
    bar.style.display = "none";
    document.getElementById("export").disabled = false;
    if (j.error) { note.textContent = ""; showMessage(j.error); return; }
    if (j.export && j.export.time >= exportStarted) {
      note.textContent = "Done. Style: " + j.export.style + ", text " + (j.export.size || "medium") +
        (j.export.vertical ? ", 9:16" : ", original size") + ".";
      showDownloads();
    }
  } catch (e) {
    bar.style.display = "none";
    document.getElementById("export").disabled = false;
    showMessage(e.message);
  }
}

function showDownloads() {
  const stamp = "?v=" + Date.now();     // avoids the browser's cached copy
  document.getElementById("dlVideo").href = "/api/jobs/" + jobId + "/download/mp4" + stamp;
  document.getElementById("dlSrt").href = "/api/jobs/" + jobId + "/download/srt" + stamp;
  document.getElementById("downloads").style.display = "flex";
}

// Ask the server for one real rendered frame and show it big.
async function exactPreview() {
  const button = document.getElementById("exact");
  button.disabled = true;
  button.textContent = "Rendering…";
  try {
    const look = lookPayload();
    const url = "/api/jobs/" + jobId + "/frame?t=" + video.currentTime.toFixed(2) + "&style=" +
      encodeURIComponent(styleId) + "&vertical=" + look.vertical + "&size=" + encodeURIComponent(size) +
      "&title=" + encodeURIComponent(look.title) + "&title_seconds=" + look.title_seconds;
    const response = await fetch(url);
    if (!response.ok) {
      let data = {};
      try { data = await response.json(); } catch (e) { /* ignore */ }
      throw new Error(data.error || "Could not create the preview.");
    }
    document.getElementById("modalImg").src = URL.createObjectURL(await response.blob());
    document.getElementById("modal").classList.add("show");
  } catch (e) {
    showMessage(e.message);
  }
  button.disabled = false;
  button.textContent = "Exact preview";
}

// ---------- buttons ----------

document.getElementById("export").onclick = startExport;
document.getElementById("exact").onclick = exactPreview;
document.getElementById("modal").onclick = function () { this.classList.remove("show"); };
document.getElementById("toCyr").onclick = function () { edit({ op: "translit", direction: "to_cyrillic" }); };
document.getElementById("toLat").onclick = function () { edit({ op: "translit", direction: "to_latin" }); };
document.getElementById("undo").onclick = function () { edit({ op: "undo" }); };
document.getElementById("redo").onclick = function () { edit({ op: "redo" }); };
document.getElementById("addFirst").onclick = function () { edit({ op: "insert", line: -1, text: "New line" }); };
document.getElementById("words").onchange = function () { edit({ op: "words", max_words: this.value }); };
document.querySelectorAll("#sizes button").forEach(function (b) {
  b.onclick = function () { size = b.dataset.size; drawSizes(); saveLook(); shownLine = -2; shownTitle = ""; };
});
document.getElementById("vertical").onchange = saveLook;
titleInput.oninput = function () { shownTitle = ""; saveLook(); };
titleSeconds.onchange = function () { shownTitle = ""; saveLook(); };

// Ctrl+Z = undo, Ctrl+Y or Ctrl+Shift+Z = redo. While typing in a caption or the
// title box, the keys keep their normal meaning (undo your typing).
document.addEventListener("keydown", function (e) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const el = document.activeElement;
  const typing = el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  if (typing) return;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) { e.preventDefault(); if (history.undo) edit({ op: "undo" }); }
  else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); if (history.redo) edit({ op: "redo" }); }
});
document.getElementById("reset").onclick = function () {
  if (confirm("Throw away all your edits and go back to the automatic transcript?")) edit({ op: "reset" });
};

start();
requestAnimationFrame(tick);
