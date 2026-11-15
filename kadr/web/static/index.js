// Upload page: sends videos to the server and shows the queue with live status.

const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const uploadBar = document.getElementById("uploadBar");
let lastJobsText = "";   // used to skip redrawing when nothing changed
let mode = localStorage.getItem("kadr-mode") || "subs";   // "subs" or "translate"
const LANG_SHORT = { en: "EN", ru: "RU", uz: "UZ" };

// Switch between "Subtitles" and "Translated subtitles".
function setMode(m) {
  mode = m;
  try { localStorage.setItem("kadr-mode", m); } catch (e) { /* ignore */ }
  document.querySelectorAll("#modes button").forEach(function (b) { b.classList.toggle("on", b.dataset.mode === m); });
  const t = m === "translate";
  document.getElementById("languageField").style.display = t ? "none" : "";
  document.getElementById("fromField").style.display = t ? "" : "none";
  document.getElementById("toField").style.display = t ? "" : "none";
}
document.querySelectorAll("#modes button").forEach(function (b) { b.onclick = function () { setMode(b.dataset.mode); }; });

// The subtitle language can never be the same as the spoken one.
document.getElementById("fromLang").onchange = function () {
  document.getElementById("toLang").value = this.value === "en" ? "ru" : "en";
};
document.getElementById("toLang").onchange = function () {
  document.getElementById("fromLang").value = this.value === "en" ? "ru" : "en";
};

// Fill the model list and the device badge.
async function loadInfo() {
  try {
    const info = await api("GET", "/api/info");
    document.getElementById("device").textContent =
      info.device === "cuda" ? "NVIDIA GPU found" : "Running on CPU";
    const select = document.getElementById("model");
    select.innerHTML = "";
    const auto = new Option("Default (recommended)", "");
    auto.title = info.default_model;
    select.add(auto);
    select.title = "Default: " + info.default_model;
    info.models.forEach(function (m) { select.add(new Option(m, m)); });
    document.getElementById("limits").textContent =
      "Several files at once are fine. Limit: " + Math.round(info.max_video_seconds / 60) +
      " minutes and " + info.max_upload_mb + " MB per video.";
  } catch (e) {
    showMessage(e.message);
  }
}

// Send the chosen files. XMLHttpRequest is used because it reports upload progress.
function upload(files) {
  if (!files.length) return;
  hideMessage();
  const form = new FormData();
  for (const f of files) form.append("files", f);
  if (mode === "translate") {
    form.append("language", document.getElementById("fromLang").value);
    form.append("translate_to", document.getElementById("toLang").value);
  } else {
    form.append("language", document.getElementById("language").value);
  }
  form.append("model", document.getElementById("model").value);
  form.append("max_words", document.getElementById("maxWords").value);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/jobs");
  uploadBar.style.display = "block";
  xhr.upload.onprogress = function (e) {
    if (e.lengthComputable) uploadBar.firstElementChild.style.width = (e.loaded / e.total * 100) + "%";
  };
  xhr.onload = function () {
    uploadBar.style.display = "none";
    uploadBar.firstElementChild.style.width = "0";
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch (e) { /* ignore */ }
    if (xhr.status >= 400) {
      showMessage(data.error || "Upload failed.");
    } else if (data.problems && data.problems.length) {
      showMessage("Some files were skipped: " + data.problems.join(" "));
    }
    refreshJobs();
  };
  xhr.onerror = function () {
    uploadBar.style.display = "none";
    showMessage("Upload failed. Is the program still running in the terminal?");
  };
  xhr.send(form);
}

// Build the HTML element for one job.
function jobElement(job) {
  const el = document.createElement("div");
  el.className = "job";

  const left = document.createElement("div");
  const name = document.createElement("div");
  name.className = "name";
  name.title = job.name;
  const fname = document.createElement("span");
  fname.className = "fname";
  fname.textContent = job.name;
  name.append(fname);
  const opts = job.options || {};
  if (opts.translate_to) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = (LANG_SHORT[opts.language] || opts.language) + " → " + (LANG_SHORT[opts.translate_to] || opts.translate_to);
    tag.title = "Translated subtitles";
    name.append(tag);
  }
  const meta = document.createElement("div");
  meta.className = "meta";
  const parts = [job.stage];
  if (job.info && job.info.duration) parts.push(formatTime(job.info.duration));
  if (job.status === "ready" && job.model) parts.push(shortModel(job.model) + " on " + (job.device === "cuda" ? "GPU" : "CPU"));
  meta.textContent = parts.filter(Boolean).join(" · ");
  meta.title = meta.textContent;
  left.append(name, meta);

  const actions = document.createElement("div");
  actions.className = "actions";
  const badge = document.createElement("span");
  badge.className = "badge " + job.status;
  badge.textContent = statusLabel(job.status);
  actions.append(badge);
  if (job.status === "ready" || job.status === "exporting") {
    const open = document.createElement("a");
    open.className = "button primary";
    open.href = "/editor?id=" + job.id;
    open.textContent = "Open editor";
    actions.append(open);
  }
  if (job.has_output && job.status === "ready") {
    const dl = document.createElement("a");
    dl.className = "button";
    dl.href = "/api/jobs/" + job.id + "/download/mp4";
    dl.textContent = "↓ Download";
    dl.title = "Download the finished video";
    actions.append(dl);
  }
  if (job.status === "error") {
    const retry = document.createElement("button");
    retry.textContent = "Try again";
    retry.onclick = async function () {
      try { await api("POST", "/api/jobs/" + job.id + "/retry"); refreshJobs(); } catch (e) { showMessage(e.message); }
    };
    actions.append(retry);
  }
  if (job.status !== "processing" && job.status !== "exporting") {
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete";
    del.onclick = async function () {
      if (!confirm('Delete "' + job.name + '" and its captions?')) return;
      try { await api("DELETE", "/api/jobs/" + job.id); refreshJobs(); } catch (e) { showMessage(e.message); }
    };
    actions.append(del);
  }
  el.append(left, actions);

  if (job.status === "processing" || job.status === "exporting" || job.status === "queued") {
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = Math.round((job.progress || 0) * 100) + "%";
    bar.append(fill);
    el.append(bar);
  }
  if (job.error) {
    const err = document.createElement("div");
    err.className = "err";
    err.textContent = job.error;
    el.append(err);
  }
  return el;
}

// Ask the server for the list of jobs and redraw it if something changed.
async function refreshJobs() {
  let data;
  try {
    data = await api("GET", "/api/jobs");
  } catch (e) {
    showMessage(e.message);
    return;
  }
  if (data.disk_bytes !== undefined) {
    document.getElementById("disk").textContent = formatBytes(data.disk_bytes) + " on disk";
  }
  const text = JSON.stringify(data.jobs);
  if (text === lastJobsText) return;
  lastJobsText = text;
  const box = document.getElementById("jobs");
  box.innerHTML = "";
  if (!data.jobs.length) {
    box.innerHTML = '<div class="empty">Nothing here yet. Upload a video to start.</div>';
    return;
  }
  data.jobs.forEach(function (job) { box.append(jobElement(job)); });
}

drop.onclick = function () { fileInput.click(); };
fileInput.onchange = function () { upload(Array.from(fileInput.files)); fileInput.value = ""; };
drop.onkeydown = function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } };
drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = function () { drop.classList.remove("over"); };
drop.ondrop = function (e) {
  e.preventDefault();
  drop.classList.remove("over");
  upload(Array.from(e.dataTransfer.files));
};

// "medium + yuldashev222/whisper-small-uz-v1-ct2" -> "medium + Uzbek model"
function shortModel(model) {
  return String(model).split(" + ").map(function (m) {
    return m.indexOf("/") >= 0 || /-uz/.test(m) ? "Uzbek model" : m;
  }).join(" + ");
}

function formatBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + " GB";
  return Math.round(n / 1e6) + " MB";
}

setMode(mode);
loadInfo();
refreshJobs();
setInterval(refreshJobs, 1500);
