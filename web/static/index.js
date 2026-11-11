// Upload page: sends videos to the server and shows the queue with live status.

const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const uploadBar = document.getElementById("uploadBar");
let lastJobsText = "";   // used to skip redrawing when nothing changed

// Fill the model list and the device badge.
async function loadInfo() {
  try {
    const info = await api("GET", "/api/info");
    document.getElementById("device").textContent =
      info.device === "cuda" ? "NVIDIA GPU found" : "Running on CPU";
    const select = document.getElementById("model");
    select.innerHTML = "";
    const auto = new Option("Default (" + info.default_model + ")", "");
    select.add(auto);
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
  form.append("language", document.getElementById("language").value);
  form.append("model", document.getElementById("model").value);

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
  name.textContent = job.name;
  const meta = document.createElement("div");
  meta.className = "meta";
  const parts = [job.stage];
  if (job.info && job.info.duration) parts.push(formatTime(job.info.duration));
  if (job.status === "ready" && job.model) parts.push("model " + job.model + " on " + job.device);
  meta.textContent = parts.filter(Boolean).join(" · ");
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
    dl.textContent = "Download";
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
drop.ondragover = function (e) { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = function () { drop.classList.remove("over"); };
drop.ondrop = function (e) {
  e.preventDefault();
  drop.classList.remove("over");
  upload(Array.from(e.dataTransfer.files));
};

loadInfo();
refreshJobs();
setInterval(refreshJobs, 1500);
