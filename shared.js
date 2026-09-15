// Delt datalag mellem index.html (app.js) og infoscreen.html (infoscreen.js).
// Ændrer du kolonner i arket, ret ét sted: rowsToJobs() herunder.
window.Tourne = (() => {
  "use strict";

  const SHEET_ID = "13UknVDtGjBalQQB17VmBXT99xIK-wNSz8EMj5lpgWQg";
  const SHEET_TAB = "Ark1";
  const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_TAB)}`;
  // SHA-256 of the shared passcode. Never store the plaintext code here.
  const PASSCODE_HASH = "850ee924350e48b4f888bf02797d20cc84aa64c5acbfc7fe203357107ddaa5b0";
  const AUTH_STORAGE_KEY = "tourne-info-auth";

  const WEEKDAYS = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const MONTHS = [
    "januar", "februar", "marts", "april", "maj", "juni",
    "juli", "august", "september", "oktober", "november", "december",
  ];

  // Kronologisk rækkefølge af tidsfelterne på et job. Bruges både til
  // chip-visningen på hovedsiden og tidslinjen/nedtællingen på infoskærmen.
  const TIME_FIELDS = [
    ["crewGetIn", "Crew get-in"],
    ["afgangVibyJ", "Afgang Viby J"],
    ["artistGetIn", "Artist get-in"],
    ["lydprove", "Lydprøve"],
    ["aftensmad", "Aftensmad"],
    ["dore", "Døre"],
    ["showtid", "Showtid"],
    ["sluttid", "Sluttid"],
  ];

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
      adresse: idx("Adresse"),
      crewGetIn: idx("Crew get-in"),
      afgangVibyJ: idx("Afgang Viby J"),
      artistGetIn: idx("Artist get-in"),
      lydprove: idx("Lydprøve"),
      aftensmad: idx("Aftensmad"),
      dore: idx("Døre"),
      showtid: idx("Showtid"),
      sluttid: idx("Sluttid"),
      hotelArtist: idx("Hotel Artist"),
      hotelCrew: idx("Hotel Crew"),
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
        adresse: get(r, "adresse"),
        crewGetIn: get(r, "crewGetIn"),
        afgangVibyJ: get(r, "afgangVibyJ"),
        artistGetIn: get(r, "artistGetIn"),
        lydprove: get(r, "lydprove"),
        aftensmad: get(r, "aftensmad"),
        dore: get(r, "dore"),
        showtid: get(r, "showtid"),
        sluttid: get(r, "sluttid"),
        hotelArtist: get(r, "hotelArtist"),
        hotelCrew: get(r, "hotelCrew"),
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

  async function fetchJobs() {
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCsv(text);
    const jobs = rowsToJobs(rows);
    if (jobs.length === 0) throw new Error("Arket ser tomt ud.");
    return jobs;
  }

  // ---------- Dato/tid ----------

  function parseDato(dato) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dato || "");
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function formatDato(dato) {
    const d = parseDato(dato);
    if (!d) return { weekday: "", date: dato || "Dato mangler" };
    return {
      weekday: WEEKDAYS[d.getDay()],
      date: `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
    };
  }

  // Fortolker kl.-strenge som "18:30", "18.30" eller "18:30?" til et
  // Date-objekt på samme dag som `dato`. Returnerer null hvis strengen
  // ikke indeholder et genkendeligt klokkeslæt (fx "TBA" eller "Kører hjem").
  function parseTimeOnDate(dato, timeStr) {
    const day = parseDato(dato);
    if (!day || !timeStr) return null;
    const m = /(\d{1,2})[:.](\d{2})/.exec(timeStr);
    if (!m) return null;
    const d = new Date(day);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }

  function isSameDate(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

  function findTodayIndex(list) {
    const today = new Date();
    for (let i = 0; i < list.length; i++) {
      if (isSameDate(parseDato(list[i].dato), today)) return i;
    }
    return -1;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    CSV_URL,
    PASSCODE_HASH,
    AUTH_STORAGE_KEY,
    WEEKDAYS,
    MONTHS,
    TIME_FIELDS,
    sha256Hex,
    isUnlocked,
    parseCsv,
    rowsToJobs,
    fetchJobs,
    parseDato,
    formatDato,
    parseTimeOnDate,
    isSameDate,
    findUpcomingIndex,
    findTodayIndex,
    escapeHtml,
  };
})();
