(() => {
  "use strict";

  const { PASSCODE_HASH, AUTH_STORAGE_KEY, TIME_FIELDS, sha256Hex, isUnlocked, fetchJobs, parseDato, formatDato, findUpcomingIndex, escapeHtml } = window.Tourne;

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
  const jobAddress = $("job-address");
  const jobAddressLink = $("job-address-link");
  const jobAddressText = $("job-address-text");
  const jobTimes = $("job-times");
  const jobAccess = $("job-access");
  const jobAccessRows = $("job-access-rows");
  const jobHotel = $("job-hotel");
  const jobHotelRows = $("job-hotel-rows");
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

  // ---------- Data loading ----------

  async function loadData() {
    stateLoading.hidden = false;
    stateError.hidden = true;
    cardView.hidden = true;
    jobPosition.hidden = true;

    try {
      jobs = await fetchJobs();
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

    if (job.adresse) {
      jobAddress.hidden = false;
      jobAddressText.textContent = job.adresse;
      jobAddressLink.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(job.adresse);
    } else {
      jobAddress.hidden = true;
    }

    jobTimes.innerHTML = "";
    for (const [key, label] of TIME_FIELDS) {
      const value = job[key];
      if (!value) continue;
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.innerHTML = `<span class="chip-label">${label}</span>${escapeHtml(value)}`;
      jobTimes.appendChild(chip);
    }

    renderKvRows(jobAccessRows, [
      ["Doorcode", job.doorcode],
      ["Wifi (SSID)", job.ssid],
      ["Wifi-kode", job.pass],
    ]);
    jobAccess.hidden = jobAccessRows.children.length === 0;

    renderKvRows(jobHotelRows, [
      ["Artist", job.hotelArtist],
      ["Crew", job.hotelCrew],
    ]);
    jobHotel.hidden = jobHotelRows.children.length === 0;

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
        <button class="copy-btn" type="button">Kopiér</button>
      `;
      row.querySelector(".copy-btn").addEventListener("click", () => copyToClipboard(value));
      container.appendChild(row);
    }
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
