(() => {
  "use strict";

  const {
    PASSCODE_HASH, AUTH_STORAGE_KEY, TIME_FIELDS,
    sha256Hex, isUnlocked, fetchJobs,
    formatDato, parseTimeOnDate, findTodayIndex, findUpcomingIndex, escapeHtml,
  } = window.Tourne;

  const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);

  const lockScreen = $("lock-screen");
  const lockForm = $("lock-form");
  const lockInput = $("lock-input");
  const lockError = $("lock-error");

  const screen = $("screen");
  const stateLoading = $("state-loading");
  const stateError = $("state-error");
  const stateErrorDetail = $("state-error-detail");
  const stateNoShow = $("state-no-show");
  const nextShowInfo = $("next-show-info");
  const showView = $("show-view");

  const isVenue = $("is-venue");
  const isCity = $("is-city");
  const isWeekday = $("is-weekday");
  const isDate = $("is-date");

  const countdownLabel = $("countdown-label");
  const countdownValue = $("countdown-value");
  const timelineList = $("timeline-list");

  const isAccess = $("is-access");
  const isAccessRows = $("is-access-rows");
  const isHotel = $("is-hotel");
  const isHotelRows = $("is-hotel-rows");
  const isTech = $("is-tech");
  const isTechValue = $("is-tech-value");
  const isNotes = $("is-notes");
  const isNotesValue = $("is-notes-value");

  let currentJob = null;
  let timelineEntries = []; // [{ key, label, text, date }]
  let tickTimer = null;
  let refreshTimer = null;

  // ---------- Passcode gate (samme kode/lager som hovedsiden) ----------

  function showScreenApp() {
    lockScreen.hidden = true;
    screen.hidden = false;
    boot();
  }

  function showLock() {
    screen.hidden = true;
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
      showScreenApp();
    } else {
      lockError.hidden = false;
      lockInput.select();
    }
  });

  // ---------- Data ----------

  function setState(state) {
    stateLoading.hidden = state !== "loading";
    stateError.hidden = state !== "error";
    stateNoShow.hidden = state !== "no-show";
    showView.hidden = state !== "show";
  }

  async function loadAndRender() {
    setState("loading");
    try {
      const jobs = await fetchJobs();
      const todayIdx = findTodayIndex(jobs);

      if (todayIdx === -1) {
        const upcoming = jobs[findUpcomingIndex(jobs)];
        const { date } = formatDato(upcoming.dato);
        nextShowInfo.textContent = `${date} — ${upcoming.venue || upcoming.by}`;
        setState("no-show");
        currentJob = null;
        stopTicking();
        return;
      }

      currentJob = jobs[todayIdx];
      renderShow(currentJob);
      setState("show");
      startTicking();
    } catch (err) {
      stateErrorDetail.textContent =
        "Tjek at Google-arket er delt med 'Alle med linket kan se', og at du har forbindelse til internettet. (" +
        (err && err.message ? err.message : "ukendt fejl") +
        ")";
      setState("error");
      currentJob = null;
      stopTicking();
    }
  }

  function renderShow(job) {
    const { weekday, date } = formatDato(job.dato);
    isVenue.textContent = job.venue || "Venue ikke angivet";
    isCity.textContent = job.by || "";
    isCity.style.display = job.by ? "" : "none";
    isWeekday.textContent = weekday;
    isDate.textContent = date;

    timelineEntries = TIME_FIELDS
      .map(([key, label]) => ({
        key,
        label,
        text: job[key] || "",
        date: parseTimeOnDate(job.dato, job[key]),
      }))
      .filter((entry) => entry.text);

    timelineList.innerHTML = "";
    for (const entry of timelineEntries) {
      const li = document.createElement("li");
      li.className = "is-timeline-item";
      li.dataset.key = entry.key;
      li.innerHTML = `
        <span class="is-timeline-time">${escapeHtml(entry.text)}</span>
        <span class="is-timeline-label">${entry.label}</span>
      `;
      timelineList.appendChild(li);
    }

    renderKvRows(isAccessRows, [
      ["Doorcode", job.doorcode],
      ["Wifi (SSID)", job.ssid],
      ["Wifi-kode", job.pass],
    ]);
    isAccess.hidden = isAccessRows.children.length === 0;

    renderKvRows(isHotelRows, [
      ["Artist", job.hotelArtist],
      ["Crew", job.hotelCrew],
    ]);
    isHotel.hidden = isHotelRows.children.length === 0;

    if (job.hustekniker) {
      isTech.hidden = false;
      isTechValue.textContent = job.hustekniker;
    } else {
      isTech.hidden = true;
    }

    if (job.noter) {
      isNotes.hidden = false;
      isNotesValue.textContent = job.noter;
    } else {
      isNotes.hidden = true;
    }

    updateCountdown();
  }

  function renderKvRows(container, fields) {
    container.innerHTML = "";
    for (const [label, value] of fields) {
      if (!value) continue;
      const row = document.createElement("div");
      row.className = "kv-row";
      row.innerHTML = `
        <div class="kv-row-text">
          <span class="kv-row-label">${label}</span>
          <span class="kv-row-value">${escapeHtml(value)}</span>
        </div>
      `;
      container.appendChild(row);
    }
  }

  // ---------- Nedtælling ----------

  function updateCountdown() {
    const now = new Date();
    const next = timelineEntries.find((entry) => entry.date && entry.date > now);

    timelineList.querySelectorAll(".is-timeline-item").forEach((li) => {
      const entry = timelineEntries.find((e) => e.key === li.dataset.key);
      li.classList.toggle("is-past", !!(entry && entry.date && entry.date <= now));
      li.classList.toggle("is-next", !!(next && entry === next));
    });

    if (!next) {
      countdownLabel.textContent = timelineEntries.length ? "Dagens tider er overstået" : "";
      countdownValue.textContent = "–";
      return;
    }

    countdownLabel.textContent = "Næste: " + next.label;
    countdownValue.textContent = formatCountdown(next.date - now);
  }

  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function startTicking() {
    stopTicking();
    tickTimer = setInterval(updateCountdown, 1000);
  }

  function stopTicking() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  // ---------- Boot ----------

  function boot() {
    loadAndRender();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadAndRender, REFRESH_INTERVAL_MS);
  }

  if (isUnlocked()) {
    showScreenApp();
  } else {
    showLock();
  }
})();
