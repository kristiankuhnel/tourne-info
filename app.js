(() => {
  "use strict";

  // ---------- Config ----------
  const SHEET_ID = "13UknVDtGjBalQQB17VmBXT99xIK-wNSz8EMj5lpgWQg";
  const SHEET_TAB = "Ark1";
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;
  // SHA-256 of the shared passcode. Never store the plaintext code here.
  const PASSCODE_HASH = "850ee924350e48b4f888bf02797d20cc84aa64c5acbfc7fe203357107ddaa5b0";
  const AUTH_STORAGE_KEY = "tourne-info-auth";

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const lockScreen = $("lock-screen");
  const lockForm = $("lock-form");
  const lockInput = $("lock-input");
  const lockError = $("lock-error");

  const app = $("app");
  const btnList = $("btn-list");
  const btnRefresh = $("btn-refresh");
  const btnLock = $("btn-lock");

  const stateLoading = $("state-loading");
  const stateError = $("state-error");
  const stateErrorDetail = $("state-error-detail");
  const btnRetry = $("btn-retry");

  const cardView = $("card-view");
  const jobPosition = $("job-position");
  const btnPrev = $("btn-prev");
  const btnNext = $("btn-next");
  const jobCard = $("job-card");
  const jobWeekday = $("job-weekday");
  const jobDate = $("job-date");
  const jobVenue = $("job-venue");
  const jobCity = $("job-city");
  const jobTimes = $("job-times");
  const jobAccess = $("job-access");
  const jobAccessRows = $("job-access-rows");
  const jobTech = $("job-tech");
  const jobTechValue = $("job-tech-value");
  const jobNotes = $("job-notes");
  const jobNotesValue = $("job-notes-value");

  const listView = $("list-view");
  const listItems = $("list-items");
  const btnCloseList = $("btn-close-list");

  const toastEl = $("toast");

  let jobs = [];
  let currentIndex = 0;
  let toastTimer = null;

  // ---------- Passcode gate ----------

  async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function isUnlocked() {
    return localStorage.getItem(AUTH_STORAGE_KEY) === PASSCODE_HASH;
  }

  function showApp() {
    lockScreen.hidden = true;
    app.hidden = false;
    if (jobs.length === 0) loadData();
  }

  function showLock() {
    app.hidden = true;
    lockScreen.hidden = false;
    lockInput.value = "";
    lockError.hidden = true;
    setTimeout(() => lockInput.focus(), 50);
  }

  lockForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = lockInput.value.trim();
    if (!value) return;
    const hash = await sha256Hex(value);
    if (hash === PASSCODE_HASH) {
      localStorage.setItem(AUTH_STORAGE_KEY, hash);
      lockError.hidden = true;
      showApp();
    } else {
      lockError.hidden = false;
      lockInput.select();
    }
  });

  btnLock.addEventListener("click", () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    showLock();
  });

  // ---------- CSV parsing (RFC4180-ish) ----------

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
        continue;
      }

      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  }

  function rowsToJobs(rows) {
    if (rows.length === 0) return [];
    const header = rows[0].map((h) => h.trim());
    const idx = (name) => header.indexOf(name);

    const col = {
      dato: idx("Dato"),
      by: idx("By"),
      venue: idx("Venue"),
      aftensmad: idx("Aftensmad"),
      showtid: idx("Showtid"),
      sluttid: idx("Sluttid"),
      doorcode: idx("Doorcode"),
      ssid: idx("SSID"),
      pass: idx("PASS"),
      hustekniker: idx("Hustekniker"),
      noter: idx("Noter"),
    };

    const get = (r, key) => {
      const i = col[key];
      if (i === -1 || i === undefined) return "";
      return (r[i] || "").trim();
    };

    const result = [];
    let lastDato = "";
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      let dato = get(r, "dato");
      if (dato) lastDato = dato;
      else dato = lastDato;

      const job = {
        dato,
        by: get(r, "by"),
        venue: get(r, "venue"),
        aftensmad: get(r, "aftensmad"),
        showtid: get(r, "showtid"),
        sluttid: get(r, "sluttid"),
        doorcode: get(r, "doorcode"),
        ssid: get(r, "ssid"),
        pass: get(r, "pass"),
        hustekniker: get(r, "hustekniker"),
        noter: get(r, "noter"),
      };
      if (!job.venue && !job.by) continue;
      result.push(job);
    }
    return result;
  }

  // ---------- Data loading ----------

  async function loadData() {
    stateLoading.hidden = false;
    stateError.hidden = true;
    cardView.hidden = true;
    jobPosition.hidden = true;

    try {
      const res = await fetch(CSV_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rows = parseCsv(text);
      const parsedJobs = rowsToJobs(rows);
      if (parsedJobs.length === 0) throw new Error("Arket ser tomt ud.");

      jobs = parsedJobs;
      currentIndex = findUpcomingIndex(jobs);

      stateLoading.hidden = true;
      cardView.hidden = false;
      jobPosition.hidden = false;
      renderJob(currentIndex);
      renderList();
    } catch (err) {
      stateLoading.hidden = true;
      stateError.hidden = false;
      stateErrorDetail.textContent =
        "Tjek at Google-arket er delt med 'Alle med linket kan se', og at du har forbindelse til internettet. (" +
        (err && err.message ? err.message : "ukendt fejl") +
        ")";
    }
  }

  function findUpcomingIndex(list) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < list.length; i++) {
      const d = parseDato(list[i].dato);
      if (d && d >= today) return i;
    }
    return list.length - 1;
  }

  function parseDato(dato) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dato || "");
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const MONTHS = [
    "januar", "februar", "marts", "april", "maj", "juni",
    "juli", "august", "september", "oktober", "november", "december",
  ];

  function formatDato(dato) {
    const d = parseDato(dato);
    if (!d) return { weekday: "", date: dato || "Dato mangler" };
    return {
      weekday: WEEKDAYS[d.getDay()],
      date: `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    };
  }

  // ---------- Rendering ----------

  function renderJob(index) {
    const job = jobs[index];
    if (!job) return;
    currentIndex = index;

    const { weekday, date } = formatDato(job.dato);
    jobWeekday.textContent = weekday;
    jobDate.textContent = date;

    jobVenue.textContent = job.venue || "Venue ikke angivet";
    jobCity.textContent = job.by || "";
    jobCity.style.display = job.by ? "" : "none";

    jobTimes.innerHTML = "";
    const timeFields = [
      ["Aftensmad", job.aftensmad],
      ["Showtid", job.showtid],
      ["Sluttid", job.sluttid],
    ];
    for (const [label, value] of timeFields) {
      if (!value) continue;
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `<span class="chip-label">${label}</span>${escapeHtml(value)}`;
      jobTimes.appendChild(chip);
    }

    const accessFields = [
      ["Doorcode", job.doorcode],
      ["Wifi (SSID)", job.ssid],
      ["Wifi-kode", job.pass],
    ];
    const activeAccess = accessFields.filter(([, v]) => v);
    jobAccessRows.innerHTML = "";
    if (activeAccess.length > 0) {
      jobAccess.hidden = false;
      for (const [label, value] of activeAccess) {
        const row = document.createElement("div");
        row.className = "access-row";
        row.innerHTML = `
          <div class="access-row-text">
            <span class="access-row-label">${label}</span>
            <span class="access-row-value">${escapeHtml(value)}</span>
          </div>
          <button class="copy-btn" type="button">Kopiér</button>
        `;
        row.querySelector(".copy-btn").addEventListener("click", () => copyToClipboard(value));
        jobAccessRows.appendChild(row);
      }
    } else {
      jobAccess.hidden = true;
    }

    if (job.hustekniker) {
      jobTech.hidden = false;
      jobTechValue.textContent = job.hustekniker;
    } else {
      jobTech.hidden = true;
    }

    if (job.noter) {
      jobNotes.hidden = false;
      jobNotesValue.textContent = job.noter;
    } else {
      jobNotes.hidden = true;
    }

    btnPrev.disabled = index <= 0;
    btnNext.disabled = index >= jobs.length - 1;
    jobPosition.textContent = `Job ${index + 1} af ${jobs.length}`;

    highlightActiveListItem();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderList() {
    listItems.innerHTML = "";
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    jobs.forEach((job, i) => {
      const { date } = formatDato(job.dato);
      const d = parseDato(job.dato);
      const li = document.createElement("li");
      li.className = "list-item" + (d && d < today ? " is-past" : "");
      li.dataset.index = String(i);
      li.innerHTML = `
        <span class="list-item-date">${date}</span>
        <span class="list-item-main">
          <span class="list-item-venue">${escapeHtml(job.venue || job.by || "Ukendt")}</span><br/>
          <span class="list-item-city">${escapeHtml(job.by || "")}</span>
        </span>
      `;
      li.addEventListener("click", () => {
        renderJob(i);
        closeList();
      });
      listItems.appendChild(li);
    });
    highlightActiveListItem();
  }

  function highlightActiveListItem() {
    const nodes = listItems.querySelectorAll(".list-item");
    nodes.forEach((node) => {
      node.classList.toggle("is-active", Number(node.dataset.index) === currentIndex);
    });
  }

  // ---------- Navigation ----------

  function goPrev() {
    if (currentIndex > 0) renderJob(currentIndex - 1);
  }

  function goNext() {
    if (currentIndex < jobs.length - 1) renderJob(currentIndex + 1);
  }

  btnPrev.addEventListener("click", goPrev);
  btnNext.addEventListener("click", goNext);

  document.addEventListener("keydown", (e) => {
    if (app.hidden || !listView.hidden) return;
    if (e.key === "ArrowLeft") goPrev();
    if (e.key === "ArrowRight") goNext();
  });

  let touchStartX = null;
  let touchStartY = null;
  jobCard.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }, { passive: true });

  jobCard.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    touchStartX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext();
      else goPrev();
    }
  }, { passive: true });

  // ---------- List view toggle ----------

  function openList() {
    listView.hidden = false;
  }
  function closeList() {
    listView.hidden = true;
  }
  btnList.addEventListener("click", openList);
  btnCloseList.addEventListener("click", closeList);

  // ---------- Refresh / retry ----------

  btnRefresh.addEventListener("click", () => {
    loadData().then(() => showToast("Opdateret"));
  });
  btnRetry.addEventListener("click", loadData);

  // ---------- Copy / toast ----------

  async function copyToClipboard(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast("Kopieret: " + value);
    } catch {
      showToast(value);
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 2200);
  }

  // ---------- Boot ----------

  if (isUnlocked()) {
    showApp();
  } else {
    showLock();
  }
})();
