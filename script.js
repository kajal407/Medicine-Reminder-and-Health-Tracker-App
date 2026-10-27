
"use strict";

/* MYHEALTH — browser-based student project */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = "myhealth_app_v3";

const defaultData = () => ({
  medicines: [],
  appointments: [],
  reports: [],
  prescriptions: [],
  family: [{ id: "self", name: "Kajal Singh", relation: "Self", age: "", notes: "" }],
  selectedProfile: "self",
  activity: [],
  settings: { reminders: true, appointmentAlerts: true, demoMode: true }
});

let data = loadData();
let currentPage = "Dashboard";
let editing = null;
let chartInstances = [];
let toastTimer;

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultData();
    const parsed = JSON.parse(saved);
    const defaults = defaultData();
    return {
      ...defaults, ...parsed,
      medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      prescriptions: Array.isArray(parsed.prescriptions) ? parsed.prescriptions : [],
      family: Array.isArray(parsed.family) && parsed.family.length ? parsed.family : defaults.family,
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
      settings: { ...defaults.settings, ...(parsed.settings || {}) }
    };
  } catch (error) {
    console.error("Could not load MyHealth data:", error);
    return defaultData();
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error(error);
    notify("Storage is full. Remove some large report files and try again.");
    return false;
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateLabel(value, options = { day: "numeric", month: "short", year: "numeric" }) {
  if (!value) return "—";
  const d = new Date(value + (value.length === 10 ? "T12:00:00" : ""));
  return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString("en-IN", options);
}

function timeLabel(value) {
  if (!value) return "—";
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return esc(value);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-IN", {
    hour: "numeric", minute: "2-digit"
  });
}

function selectedProfile() {
  return data.family.find(p => p.id === data.selectedProfile) || data.family[0];
}

function belongsToSelected(record) {
  return (record.profileId || "self") === data.selectedProfile;
}

function addActivity(message) {
  data.activity.unshift({ id: uid(), message, date: new Date().toISOString() });
  data.activity = data.activity.slice(0, 30);
}

function notify(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function setPage(page) {
  const pages = [
    "Dashboard", "Medicine Reminders", "Health Reports", "Appointments",
    "Prescriptions", "Family Profiles", "Analytics", "Settings"
  ];
  if (!pages.includes(page)) page = "Dashboard";

  currentPage = page;
  $$(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  $("#pageLabel").textContent = page;
  $("#sidebar").classList.remove("open");

  const profile = selectedProfile();
  $("#sidebarName").textContent = profile.name;

  const headings = {
    "Dashboard": ["YOUR PERSONAL HEALTH SPACE", `Hello, ${profile.name.split(" ")[0]} 👋`, "A clearer picture of your health starts here.", "＋ Add medicine"],
    "Medicine Reminders": ["MEDICATION MANAGEMENT", "Medicine reminders", "Manage your medicines and record doses taken.", "＋ Add medicine"],
    "Health Reports": ["YOUR HEALTH DOCUMENTS", "Health reports", "Keep your important health documents organised.", "＋ Add report"],
    "Appointments": ["CARE & CONSULTATIONS", "Appointments", "Plan checkups and keep track of upcoming visits.", "＋ Add appointment"],
    "Prescriptions": ["PRESCRIPTION LIBRARY", "Prescriptions", "Save prescription details for future reference.", "＋ Add prescription"],
    "Family Profiles": ["FAMILY HEALTH SPACE", "Family profiles", "Keep separate health records for family members.", "＋ Add profile"],
    "Analytics": ["HEALTH INSIGHTS", "Health analytics", "Explore medicine records and appointment patterns.", "＋ Add medicine"],
    "Settings": ["YOUR PREFERENCES", "Settings", "Manage your local demo preferences and data.", "Save settings"]
  };

  const [eyebrow, title, subtitle, action] = headings[page];
  $("#eyebrow").textContent = eyebrow;
  $("#pageTitle").textContent = title;
  $("#pageSubtitle").textContent = subtitle;
  $("#headingAction").textContent = action;

  renderPage();
}

function renderPage() {
  destroyCharts();
  const host = $("#pageContent");
  if (!host) return;

  const renderers = {
    "Dashboard": renderDashboard,
    "Medicine Reminders": renderMedicines,
    "Health Reports": renderReports,
    "Appointments": renderAppointments,
    "Prescriptions": renderPrescriptions,
    "Family Profiles": renderFamily,
    "Analytics": renderAnalytics,
    "Settings": renderSettings
  };

  host.innerHTML = (renderers[currentPage] || renderDashboard)();
  renderCharts();
}

function destroyCharts() {
  chartInstances.forEach(chart => {
    try { chart.destroy(); } catch (_) {}
  });
  chartInstances = [];
}

function empty(icon, title, description, buttonLabel, action) {
  return `<div class="empty-state">
    <span>${icon}</span><strong>${esc(title)}</strong><p>${esc(description)}</p>
    ${buttonLabel ? `<button class="btn btn-primary" data-action="${action}">${esc(buttonLabel)}</button>` : ""}
  </div>`;
}

function statCard(icon, label, value, note) {
  return `<div class="stat-card">
    <div class="stat-top"><span>${esc(label)}</span><span class="stat-icon">${icon}</span></div>
    <div class="stat-value">${esc(value)}</div>
    <div class="stat-note">${note}</div>
  </div>`;
}

function panelHeader(title, subtitle, action = "", page = "") {
  return `<div class="panel-header"><div><h2>${title}</h2><p>${subtitle}</p></div>
    ${action ? `<button class="text-link" data-page="${esc(page)}">${esc(action)} →</button>` : ""}
  </div>`;
}

function medicineRecords() {
  return data.medicines.filter(belongsToSelected);
}

function appointmentRecords() {
  return data.appointments.filter(belongsToSelected);
}

function reportRecords() {
  return data.reports.filter(belongsToSelected);
}

function prescriptionRecords() {
  return data.prescriptions.filter(belongsToSelected);
}

function upcomingAppointments() {
  return appointmentRecords()
    .filter(a => a.date >= todayISO() && a.status !== "Cancelled")
    .sort((a, b) => (a.date + (a.time || "" )).localeCompare(b.date + (b.time || "")));
}

function doseTakenToday(medicine) {
  return medicine.lastTakenDate === todayISO();
}

function renderDashboard() {
  const meds = medicineRecords();
  const upcoming = upcomingAppointments();
  const reports = reportRecords();
  const dueMeds = meds.filter(m => m.status !== "Stopped" && !doseTakenToday(m));
  const taken = meds.filter(doseTakenToday).length;
  const adherence = meds.length ? Math.round((taken / meds.length) * 100) : 0;
  const profile = selectedProfile();

  return `
    <div class="welcome-card">
      <div><p class="eyebrow">A LITTLE CARE, EVERY DAY</p><h2>Your health, all in one place.</h2>
      <p>Viewing records for <strong>${esc(profile.name)}</strong>. Remember to follow your clinician's instructions.</p></div>
      <div class="welcome-mark">✚</div>
    </div>

    <div class="stats-grid">
      ${statCard("💊", "Total medicines", meds.length, `<span class="positive">${meds.filter(m => m.status !== "Stopped").length} active</span>`)}
      ${statCard("✓", "Taken today", taken, `${dueMeds.length} not marked taken today`)}
      ${statCard("▣", "Upcoming visits", upcoming.length, "Scheduled appointments")}
      ${statCard("▤", "Health reports", reports.length, "Saved report records")}
    </div>

    <div class="two-col">
      <section class="panel">
        ${panelHeader("Medicine tracker", "Your current medicine records", "View all", "Medicine Reminders")}
        ${meds.length ? `<div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Schedule</th><th>Status</th><th>Action</th></tr></thead><tbody>
          ${meds.slice(0, 5).map(m => `<tr>
            <td><div class="medicine-line"><div class="medicine-icon">💊</div><div><strong>${esc(m.name)}</strong><br><small>${esc(m.dosage || "Dosage not entered")}</small></div></div></td>
            <td>${esc(m.time || "Not set")}</td>
            <td><span class="pill ${m.status === "Stopped" ? "pill-grey" : doseTakenToday(m) ? "pill-green" : "pill-amber"}">${m.status === "Stopped" ? "Stopped" : doseTakenToday(m) ? "Taken today" : "Not marked"}</span></td>
            <td>${m.status === "Stopped" ? "—" : `<button class="btn btn-light btn-sm" data-action="take-medicine" data-id="${esc(m.id)}">${doseTakenToday(m) ? "Undo" : "Mark taken"}</button>`}</td>
          </tr>`).join("")}
        </tbody></table></div>` : empty("💊", "No medicines added", "Add your first medicine to begin tracking.", "Add medicine", "add-medicine")}
      </section>

      <section class="panel">
        ${panelHeader("Upcoming appointments", "Your next scheduled visits", "View calendar", "Appointments")}
        ${upcoming.length ? `<div class="list-stack">${upcoming.slice(0, 4).map(a => `
          <div class="list-item"><div class="date-box"><strong>${esc(a.date.slice(8, 10))}</strong><small>${esc(a.date.slice(5, 7))}</small></div>
          <div class="grow"><strong>${esc(a.doctor || "Doctor appointment")}</strong><small>${esc(a.specialty || "General")} · ${esc(timeLabel(a.time))}</small><small>${esc(a.location || "Location not added")}</small></div>
          <span class="pill pill-green">${esc(a.status || "Scheduled")}</span></div>`).join("")}</div>` : empty("▣", "Nothing scheduled", "Add an appointment to see it here.", "Add appointment", "add-appointment")}
      </section>
    </div>

    <div class="two-col">
      <section class="panel">
        ${panelHeader("Medicine overview", "Current records marked taken today", "See analytics", "Analytics")}
        <div class="chart-wrap"><canvas id="adherenceChart" aria-label="Medicine status chart"></canvas></div>
        <p class="stat-note">This is based on manual entries in this browser, not a verified clinical adherence measure.</p>
      </section>
      <section class="panel">
        ${panelHeader("Recent activity", "Changes made in this profile")}
        ${data.activity.length ? `<div class="list-stack">${data.activity.slice(0, 6).map(item => `
          <div class="list-item"><div class="medicine-icon">✓</div><div class="grow"><strong>${esc(item.message)}</strong><small>${esc(new Date(item.date).toLocaleString())}</small></div></div>`).join("")}</div>` : empty("✦", "Your activity will appear here", "Add a medicine, appointment or report to get started.")}
      </section>
    </div>`;
}

function renderMedicines() {
  const meds = medicineRecords();
  return `<section class="panel">
    <div class="toolbar">
      <div class="toolbar-left"><input class="search-input" id="medicineSearch" placeholder="Search medicines..." aria-label="Search medicines">
      <select class="filter-select" id="medicineFilter" aria-label="Filter medicines"><option value="all">All statuses</option><option value="active">Active</option><option value="stopped">Stopped</option><option value="taken">Taken today</option><option value="pending">Not marked today</option></select></div>
      <div class="toolbar-right"><button class="btn btn-primary" data-action="add-medicine">＋ Add medicine</button></div>
    </div>
    <div id="medicineTable">${medicineTable(meds)}</div>
  </section>
  <section class="panel"><h2>Medication safety</h2><p class="stat-note">This app records information you enter. It does not determine whether a medicine is suitable, calculate doses, or replace advice from your doctor or pharmacist. Never change a prescribed dose based only on this demo.</p></section>`;
}

function medicineTable(meds) {
  if (!meds.length) return empty("💊", "No matching medicines", "Add a medicine or change your search/filter.", "Add medicine", "add-medicine");
  return `<div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Dosage</th><th>Schedule</th><th>Start date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
  ${meds.map(m => `<tr>
    <td><div class="medicine-line"><div class="medicine-icon">💊</div><div><strong>${esc(m.name)}</strong><br><small>${esc(m.notes || "No notes")}</small></div></div></td>
    <td>${esc(m.dosage || "—")}</td><td>${esc(m.time || "Not set")}<br><small>${esc(m.frequency || "—")}</small></td>
    <td>${dateLabel(m.startDate)}</td>
    <td><span class="pill ${m.status === "Stopped" ? "pill-grey" : doseTakenToday(m) ? "pill-green" : "pill-amber"}">${m.status === "Stopped" ? "Stopped" : doseTakenToday(m) ? "Taken today" : "Not marked"}</span></td>
    <td><div class="row-actions">
      ${m.status !== "Stopped" ? `<button data-action="take-medicine" data-id="${esc(m.id)}">${doseTakenToday(m) ? "Undo" : "Taken"}</button>` : ""}
      <button data-action="edit-medicine" data-id="${esc(m.id)}">Edit</button>
      <button data-action="delete-medicine" data-id="${esc(m.id)}">Delete</button>
    </div></td>
  </tr>`).join("")}
  </tbody></table></div>`;
}

function renderReports() {
  const reports = reportRecords().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<div class="two-col">
    <section class="panel">
      ${panelHeader("Upload a health report", "Add a file record to your personal library")}
      <label class="upload-zone"><span style="font-size:28px">⇧</span><strong>Select a report file</strong><span>PDF, image or document · Max 1.5 MB for local demo storage</span><input type="file" id="reportFile" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx"></label>
      <p class="field-hint" style="margin-top:12px">Files are stored in this browser's local storage when possible. This is not encrypted cloud storage; avoid sensitive real medical documents on shared devices.</p>
    </section>
    <section class="panel">
      ${panelHeader("Report summary", "Records saved for this profile")}
      <div class="stats-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        ${statCard("▤", "Total reports", reports.length, "Saved file records")}
        ${statCard("▧", "Report types", new Set(reports.map(r => r.category).filter(Boolean)).size, "Distinct categories")}
      </div>
    </section>
  </div>
  <section class="panel">
    ${panelHeader("Health report library", "Find and manage your saved reports")}
    <div class="toolbar"><div class="toolbar-left"><input class="search-input" id="reportSearch" placeholder="Search reports..." aria-label="Search reports"></div></div>
    <div id="reportList">${reportList(reports)}</div>
  </section>`;
}

function reportList(reports) {
  if (!reports.length) return empty("▤", "No reports saved", "Choose a file above to add your first report.");
  return reports.map(r => `<div class="report-card">
    <div class="report-icon">▤</div><div class="report-meta"><strong>${esc(r.name)}</strong><small>${esc(r.category || "General")} · ${dateLabel(r.date)} · ${esc(r.sizeLabel || "File record")}</small>${r.notes ? `<small>${esc(r.notes)}</small>` : ""}</div>
    ${r.dataUrl ? `<button class="btn btn-light btn-sm" data-action="download-report" data-id="${esc(r.id)}">Open</button>` : ""}
    <button class="btn btn-light btn-sm" data-action="edit-report" data-id="${esc(r.id)}">Edit</button>
    <button class="btn btn-danger btn-sm" data-action="delete-report" data-id="${esc(r.id)}">Delete</button>
  </div>`).join("");
}

function renderAppointments() {
  const appointments = appointmentRecords().sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  return `<section class="panel">
    <div class="toolbar"><div class="toolbar-left"><input class="search-input" id="appointmentSearch" placeholder="Search doctor, type or location..." aria-label="Search appointments">
    <select class="filter-select" id="appointmentFilter" aria-label="Filter appointments"><option value="all">All appointments</option><option value="upcoming">Upcoming</option><option value="past">Past</option><option value="Cancelled">Cancelled</option><option value="Completed">Completed</option></select></div>
    <div class="toolbar-right"><button class="btn btn-primary" data-action="add-appointment">＋ Add appointment</button></div></div>
    <div id="appointmentList">${appointmentList(appointments)}</div>
  </section>
  <section class="panel"><h2>Appointment planning</h2><p class="stat-note">The app stores appointment dates and times locally. It does not automatically contact clinics, confirm bookings, or guarantee that a reminder will be delivered.</p></section>`;
}

function appointmentList(items) {
  if (!items.length) return empty("▣", "No appointments found", "Add an appointment or adjust your filters.", "Add appointment", "add-appointment");
  return `<div class="table-wrap"><table><thead><tr><th>Date & time</th><th>Doctor</th><th>Specialty</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${items.map(a => `<tr><td><strong>${dateLabel(a.date)}</strong><br><small>${esc(timeLabel(a.time))}</small></td>
      <td><strong>${esc(a.doctor || "Doctor visit")}</strong><br><small>${esc(a.reason || "")}</small></td><td>${esc(a.specialty || "General")}</td>
      <td>${esc(a.location || "—")}</td><td><span class="pill ${a.status === "Cancelled" ? "pill-red" : a.status === "Completed" ? "pill-grey" : "pill-green"}">${esc(a.status || "Scheduled")}</span></td>
      <td><div class="row-actions"><button data-action="edit-appointment" data-id="${esc(a.id)}">Edit</button>
      ${a.status !== "Completed" && a.status !== "Cancelled" ? `<button data-action="complete-appointment" data-id="${esc(a.id)}">Complete</button>` : ""}
      <button data-action="delete-appointment" data-id="${esc(a.id)}">Delete</button></div></td></tr>`).join("")}
  </tbody></table></div>`;
}

function renderPrescriptions() {
  const prescriptions = prescriptionRecords().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<section class="panel">
    <div class="toolbar"><div><h2>Prescription library</h2><p class="stat-note">Store prescription details for reference.</p></div><button class="btn btn-primary" data-action="add-prescription">＋ Add prescription</button></div>
    ${prescriptions.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Doctor</th><th>Diagnosis / reason</th><th>Medicines listed</th><th>Actions</th></tr></thead><tbody>
    ${prescriptions.map(p => `<tr><td>${dateLabel(p.date)}</td><td><strong>${esc(p.doctor || "—")}</strong></td><td>${esc(p.reason || "—")}</td><td>${esc(p.medicines || "—")}</td><td><div class="row-actions"><button data-action="edit-prescription" data-id="${esc(p.id)}">Edit</button><button data-action="delete-prescription" data-id="${esc(p.id)}">Delete</button></div></td></tr>`).join("")}
    </tbody></table></div>` : empty("📋", "No prescriptions yet", "Save the details written on your prescription.", "Add prescription", "add-prescription")}
  </section>
  <section class="panel"><h2>Important</h2><p class="stat-note">These are user-entered reference notes, not verified prescriptions. Always follow the original instructions from your qualified healthcare professional.</p></section>`;
}

function renderFamily() {
  return `<section class="panel">
    <div class="panel-header"><div><h2>People in your health space</h2><p>Each profile has separate medicine, appointment, report and prescription records.</p></div><button class="btn btn-primary" data-action="add-family">＋ Add profile</button></div>
    <div class="family-grid">${data.family.map(p => `<article class="family-card ${p.id === data.selectedProfile ? "selected" : ""}">
      <div class="family-avatar">${esc(p.name.trim().charAt(0).toUpperCase() || "?")}</div>
      <h3>${esc(p.name)}</h3><p>${esc(p.relation || "Family member")}${p.age ? ` · ${esc(p.age)} years` : ""}</p>
      ${p.notes ? `<p>${esc(p.notes)}</p>` : ""}
      ${p.id === data.selectedProfile ? `<button class="btn btn-light" disabled>✓ Current profile</button>` : `<button class="btn btn-primary" data-action="switch-profile" data-id="${esc(p.id)}">View profile</button>`}
      ${p.id !== "self" ? `<div style="display:flex;gap:7px;margin-top:8px"><button class="btn btn-light" style="flex:1" data-action="edit-family" data-id="${esc(p.id)}">Edit</button><button class="btn btn-danger" style="flex:1" data-action="delete-family" data-id="${esc(p.id)}">Delete</button></div>` : ""}
    </article>`).join("")}</div>
  </section>
  <section class="panel"><h2>Profile isolation</h2><p class="stat-note">Switching profiles changes which records are displayed. This demo does not create separate logins or protect profiles from other people using the same browser.</p></section>`;
}

function renderAnalytics() {
  const meds = medicineRecords();
  const appointments = appointmentRecords();
  const reports = reportRecords();
  const taken = meds.filter(doseTakenToday).length;
  const active = meds.filter(m => m.status !== "Stopped").length;
  const completed = appointments.filter(a => a.status === "Completed").length;
  const upcoming = upcomingAppointments().length;

  return `<div class="stats-grid">
    ${statCard("💊", "Medicine records", meds.length, `${active} currently active`)}
    ${statCard("✓", "Marked taken today", taken, "Manual entries")}
    ${statCard("▣", "Completed visits", completed, `${appointments.length} total records`)}
    ${statCard("▤", "Saved reports", reports.length, "Current profile")}
  </div>
  <div class="two-col">
    <section class="panel">${panelHeader("Medicine status", "Snapshot of your current medicine records")}
      <div class="chart-wrap"><canvas id="analyticsMedicineChart"></canvas></div>
    </section>
    <section class="panel">${panelHeader("Appointment status", "Snapshot of recorded visits")}
      <div class="chart-wrap"><canvas id="analyticsAppointmentChart"></canvas></div>
    </section>
  </div>
  <section class="panel">${panelHeader("Next steps", "Keep your records up to date")}
    <div class="list-stack">
      <div class="list-item"><div class="medicine-icon">💊</div><div class="grow"><strong>Review medicine records</strong><small>Check names, schedules and status against your clinician's instructions.</small></div><button class="btn btn-light btn-sm" data-page="Medicine Reminders">Open</button></div>
      <div class="list-item"><div class="medicine-icon">▣</div><div class="grow"><strong>Plan upcoming appointments</strong><small>${upcoming} upcoming appointment(s) currently recorded.</small></div><button class="btn btn-light btn-sm" data-page="Appointments">Open</button></div>
      <div class="list-item"><div class="medicine-icon">▤</div><div class="grow"><strong>Keep reports organised</strong><small>Save dates and categories to make records easier to find.</small></div><button class="btn btn-light btn-sm" data-page="Health Reports">Open</button></div>
    </div>
  </section>`;
}

function renderSettings() {
  return `<section class="panel">
    ${panelHeader("Reminder preferences", "Preferences apply to this browser demo")}
    <div class="settings-row"><div><strong>Medicine reminders preference</strong><small>Save your preference for medicine reminder features.</small></div>
      <label class="switch"><input type="checkbox" data-setting="reminders" ${data.settings.reminders ? "checked" : ""}><span></span></label></div>
    <div class="settings-row"><div><strong>Appointment alerts preference</strong><small>Save your preference for appointment alert features.</small></div>
      <label class="switch"><input type="checkbox" data-setting="appointmentAlerts" ${data.settings.appointmentAlerts ? "checked" : ""}><span></span></label></div>
    <div class="settings-row"><div><strong>Demo mode</strong><small>Use this app for learning and demonstrations only.</small></div>
      <label class="switch"><input type="checkbox" data-setting="demoMode" ${data.settings.demoMode ? "checked" : ""}><span></span></label></div>
  </section>
  <section class="panel">
    ${panelHeader("Local data management", "Records are stored in this browser")}
    <div class="settings-row"><div><strong>Export your records</strong><small>Download a JSON backup of the records currently stored by MyHealth.</small></div><button class="btn btn-light" data-action="export-data">Export JSON</button></div>
    <div class="settings-row"><div><strong>Import a backup</strong><small>Load a MyHealth JSON backup. Existing data will be replaced after confirmation.</small></div><label class="btn btn-light">Choose JSON<input id="importData" type="file" accept=".json,application/json" hidden></label></div>
    <div class="settings-row"><div><strong>Reset all local data</strong><small>Delete all records stored by this demo in this browser. This cannot be undone.</small></div><button class="btn btn-danger" data-action="reset-data">Reset data</button></div>
  </section>
  <section class="panel"><h2>Privacy and limitations</h2><p class="stat-note">This front-end demo has no user authentication, server database, encryption, verified clinical calculations, or guaranteed background notifications. Browser storage can be cleared by the browser or device owner. Do not store sensitive real medical information on shared devices.</p></section>`;
}

/* Modal form system */

const formConfigs = {
  medicine: {
    title: "Medicine record",
    collection: "medicines",
    fields: [
      ["name", "Medicine name", "text", true],
      ["dosage", "Dosage as prescribed", "text", true],
      ["time", "Reminder time", "time", false],
      ["frequency", "Frequency", "select", false, ["Once daily", "Twice daily", "Three times daily", "As prescribed", "Other"]],
      ["startDate", "Start date", "date", false],
      ["status", "Status", "select", false, ["Active", "Stopped"]],
      ["notes", "Notes", "textarea", false]
    ]
  },
  appointment: {
    title: "Appointment",
    collection: "appointments",
    fields: [
      ["doctor", "Doctor / clinic name", "text", true],
      ["specialty", "Specialty", "text", false],
      ["date", "Appointment date", "date", true],
      ["time", "Appointment time", "time", true],
      ["location", "Location", "text", false],
      ["reason", "Reason for visit", "text", false],
      ["status", "Status", "select", false, ["Scheduled", "Completed", "Cancelled"]],
      ["notes", "Notes", "textarea", false]
    ]
  },
  report: {
    title: "Report details",
    collection: "reports",
    fields: [
      ["name", "Report name", "text", true],
      ["category", "Category", "select", false, ["Blood test", "Imaging", "General checkup", "Prescription", "Other"]],
      ["date", "Report date", "date", true],
      ["notes", "Notes", "textarea", false]
    ]
  },
  prescription: {
    title: "Prescription details",
    collection: "prescriptions",
    fields: [
      ["date", "Prescription date", "date", true],
      ["doctor", "Doctor / clinic name", "text", true],
      ["reason", "Diagnosis / reason (as written)", "text", false],
      ["medicines", "Medicines listed", "textarea", true],
      ["notes", "Additional notes", "textarea", false]
    ]
  },
  family: {
    title: "Family profile",
    collection: "family",
    fields: [
      ["name", "Full name", "text", true],
      ["relation", "Relationship", "select", true, ["Self", "Parent", "Child", "Sibling", "Spouse", "Other"]],
      ["age", "Age in years", "number", false],
      ["notes", "Notes", "textarea", false]
    ]
  }
};

function fieldHTML(field, value) {
  const [name, label, type, required, options] = field;
  const val = value ?? (name === "startDate" || name === "date" ? todayISO() : "");
  let control = "";

  if (type === "select") {
    control = `<select name="${esc(name)}" ${required ? "required" : ""}>
      <option value="">Choose an option</option>
      ${options.map(opt => `<option value="${esc(opt)}" ${String(val) === opt ? "selected" : ""}>${esc(opt)}</option>`).join("")}
    </select>`;
  } else if (type === "textarea") {
    control = `<textarea name="${esc(name)}" ${required ? "required" : ""} placeholder="Enter details...">${esc(val)}</textarea>`;
  } else {
    const min = type === "number" ? 'min="0" max="130" step="1"' : "";
    control = `<input name="${esc(name)}" type="${type}" value="${esc(val)}" ${required ? "required" : ""} ${min} ${type === "text" ? 'maxlength="200"' : ""}>`;
  }

  return `<div class="field ${type === "textarea" ? "full" : ""}"><label for="field-${esc(name)}">${esc(label)}${required ? " *" : ""}</label>
    <div id="field-${esc(name)}">${control}</div></div>`;
}

function openForm(type, record = null) {
  const config = formConfigs[type];
  if (!config) return;

  editing = { type, id: record?.id || null };
  $("#modalTitle").textContent = record ? `Edit ${config.title.toLowerCase()}` : `Add ${config.title.toLowerCase()}`;
  $("#saveModal").textContent = record ? "Save changes" : "Save record";
  $("#modalFields").innerHTML = config.fields.map(f => fieldHTML(f, record?.[f[0]])).join("");
  $("#modalBackdrop").hidden = false;
  document.body.style.overflow = "hidden";
  const first = $("#modalFields input, #modalFields select, #modalFields textarea");
  if (first) first.focus();
}

function closeForm() {
  $("#modalBackdrop").hidden = true;
  document.body.style.overflow = "";
  $("#modalForm").reset();
  editing = null;
}

function saveForm(event) {
  event.preventDefault();
  if (!editing) return;

  const config = formConfigs[editing.type];
  const formData = new FormData(event.currentTarget);
  const record = {};

  for (const field of config.fields) {
    const key = field[0];
    record[key] = String(formData.get(key) || "").trim();
  }

  if (editing.type === "family") {
    if (!record.name) return notify("Please enter a profile name.");
    if (record.age && (Number(record.age) < 0 || Number(record.age) > 130)) {
      return notify("Please enter an age between 0 and 130.");
    }
  }

  if (editing.type === "medicine" && !record.name) return notify("Please enter the medicine name.");
  if (editing.type === "appointment") {
    if (!record.doctor || !record.date || !record.time) return notify("Enter the doctor, date and time.");
    if (record.date < todayISO() && !editing.id) {
      return notify("This appointment date is in the past. Edit the date if needed.");
    }
  }
  if (editing.type === "report" && !record.name) return notify("Please enter a report name.");
  if (editing.type === "prescription" && !record.doctor) return notify("Please enter the doctor or clinic name.");

  if (editing.type === "family") {
    if (editing.id) {
      const index = data.family.findIndex(p => p.id === editing.id);
      if (index >= 0) data.family[index] = { ...data.family[index], ...record };
    } else {
      record.id = uid();
      data.family.push(record);
    }
  } else {
    const collection = data[config.collection];
    if (editing.id) {
      const index = collection.findIndex(item => item.id === editing.id);
      if (index >= 0) collection[index] = { ...collection[index], ...record };
    } else {
      record.id = uid();
      record.profileId = data.selectedProfile;
      if (editing.type === "medicine") record.status ||= "Active";
      if (editing.type === "appointment") record.status ||= "Scheduled";
      if (editing.type === "report") record.date ||= todayISO();
      collection.push(record);
    }
  }

  addActivity(`${editing.id ? "Updated" : "Added"} ${config.title.toLowerCase()}`);
  const wasFamily = editing.type === "family";
  closeForm();
  saveData();
  setPage(currentPage);
  notify(`${config.title} saved successfully.`);
}

/* Medicine tracking */

function toggleTaken(id) {
  const medicine = data.medicines.find(m => m.id === id && belongsToSelected(m));
  if (!medicine || medicine.status === "Stopped") return;

  if (doseTakenToday(medicine)) {
    delete medicine.lastTakenDate;
    addActivity(`Undid today's taken status for ${medicine.name}`);
    notify("Today's status was undone.");
  } else {
    medicine.lastTakenDate = todayISO();
    addActivity(`Marked ${medicine.name} as taken today`);
    notify("Medicine marked as taken today.");
  }

  saveData();
  renderPage();
}

function filterMedicines() {
  const query = ($("#medicineSearch")?.value || "").toLowerCase();
  const filter = $("#medicineFilter")?.value || "all";

  const filtered = medicineRecords().filter(m => {
    const matchesQuery = [m.name, m.dosage, m.notes, m.frequency].some(v => String(v || "").toLowerCase().includes(query));
    let matchesFilter = true;
    if (filter === "active") matchesFilter = m.status !== "Stopped";
    if (filter === "stopped") matchesFilter = m.status === "Stopped";
    if (filter === "taken") matchesFilter = doseTakenToday(m);
    if (filter === "pending") matchesFilter = !doseTakenToday(m) && m.status !== "Stopped";
    return matchesQuery && matchesFilter;
  });

  $("#medicineTable").innerHTML = medicineTable(filtered);
}

/* Search and filter handlers */

function filterAppointments() {
  const query = ($("#appointmentSearch")?.value || "").toLowerCase();
  const filter = $("#appointmentFilter")?.value || "all";

  const items = appointmentRecords().filter(a => {
    const matchesQuery = [a.doctor, a.specialty, a.location, a.reason].some(v => String(v || "").toLowerCase().includes(query));
    let matchesFilter = true;
    if (filter === "upcoming") matchesFilter = a.date >= todayISO() && a.status !== "Cancelled";
    if (filter === "past") matchesFilter = a.date < todayISO();
    if (filter === "Cancelled" || filter === "Completed") matchesFilter = a.status === filter;
    return matchesQuery && matchesFilter;
  }).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));

  $("#appointmentList").innerHTML = appointmentList(items);
}

function filterReports() {
  const query = ($("#reportSearch")?.value || "").toLowerCase();
  const items = reportRecords().filter(r =>
    [r.name, r.category, r.notes].some(v => String(v || "").toLowerCase().includes(query))
  );
  $("#reportList").innerHTML = reportList(items);
}

/* Chart.js */

function renderCharts() {
  if (typeof Chart === "undefined") return;

  const makeChart = (id, config) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    try {
      chartInstances.push(new Chart(canvas, config));
    } catch (error) {
      console.error("Chart error:", error);
    }
  };

  const meds = medicineRecords();
  const active = meds.filter(m => m.status !== "Stopped").length;
  const taken = meds.filter(m => doseTakenToday(m)).length;
  const notTaken = Math.max(0, active - taken);
  const stopped = meds.filter(m => m.status === "Stopped").length;

  const doughnutConfig = {
    type: "doughnut",
    data: {
      labels: ["Taken today", "Not marked taken", "Stopped"],
      datasets: [{ data: [taken, notTaken, stopped], backgroundColor: ["#07966e", "#f0bd62", "#d8e1db"], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "70%",
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true, padding: 16, font: { size: 10 } } } }
    }
  };

  makeChart("adherenceChart", doughnutConfig);
  makeChart("analyticsMedicineChart", doughnutConfig);

  const appts = appointmentRecords();
  const statusCounts = ["Scheduled", "Completed", "Cancelled"].map(status =>
    appts.filter(a => (a.status || "Scheduled") === status).length
  );

  makeChart("analyticsAppointmentChart", {
    type: "bar",
    data: {
      labels: ["Scheduled", "Completed", "Cancelled"],
      datasets: [{ label: "Appointments", data: statusCounts, backgroundColor: ["#07966e", "#75c9a6", "#e4a0a0"], borderRadius: 6, maxBarThickness: 48 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "#edf2ee" } }, x: { grid: { display: false } } }
    }
  });
}

/* Report upload and download */

async function handleReportUpload(file) {
  if (!file) return;

  const maxBytes = 1.5 * 1024 * 1024;
  if (file.size > maxBytes) {
    notify("File is larger than 1.5 MB. Choose a smaller file.");
    return;
  }

  const allowed = /\.(pdf|png|jpe?g|webp|txt|docx?)$/i;
  if (!allowed.test(file.name)) {
    notify("That file type is not supported.");
    return;
  }

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });

    const report = {
      id: uid(),
      profileId: data.selectedProfile,
      name: file.name,
      category: "Other",
      date: todayISO(),
      notes: "",
      sizeLabel: `${(file.size / 1024).toFixed(1)} KB`,
      mime: file.type || "application/octet-stream",
      dataUrl
    };

    data.reports.push(report);
    addActivity(`Uploaded report ${file.name}`);

    if (!saveData()) {
      data.reports = data.reports.filter(r => r.id !== report.id);
      return;
    }

    renderPage();
    notify("Report saved in this browser.");
  } catch (error) {
    console.error(error);
    notify("Could not read the selected file.");
  }
}

function downloadReport(id) {
  const report = data.reports.find(r => r.id === id && belongsToSelected(r));
  if (!report || !report.dataUrl) return notify("The file data is unavailable.");
  const link = document.createElement("a");
  link.href = report.dataUrl;
  link.download = report.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/* Export and import */

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `myhealth-backup-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  notify("Backup export started.");
}

async function importData(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const required = ["medicines", "appointments", "reports", "prescriptions", "family"];
    if (!parsed || !required.every(key => Array.isArray(parsed[key]))) {
      return notify("This does not look like a valid MyHealth backup.");
    }
    if (!confirm("Import this backup and replace the current local records?")) return;

    const defaults = defaultData();
    data = {
      ...defaults, ...parsed,
      settings: { ...defaults.settings, ...(parsed.settings || {}) }
    };

    if (!data.family.length) data.family = defaults.family;
    if (!data.family.some(p => p.id === data.selectedProfile)) data.selectedProfile = data.family[0].id;

    if (saveData()) {
      setPage("Dashboard");
      notify("Backup imported.");
    }
  } catch (error) {
    console.error(error);
    notify("Could not import this file. Please select a valid JSON backup.");
  }
}

function resetData() {
  if (!confirm("Delete ALL MyHealth records saved in this browser? This cannot be undone. Export a backup first if needed.")) return;
  data = defaultData();
  saveData();
  setPage("Dashboard");
  notify("Local demo data has been reset.");
}

/* Generic action dispatcher */

function actionHandler(action, id) {
  const collections = {
    medicine: data.medicines,
    appointment: data.appointments,
    report: data.reports,
    prescription: data.prescriptions,
    family: data.family
  };

  const openAdd = {
    "add-medicine": "medicine",
    "add-appointment": "appointment",
    "add-report": "report",
    "add-prescription": "prescription",
    "add-family": "family"
  };

  if (openAdd[action]) return openForm(openAdd[action]);

  if (action === "take-medicine") return toggleTaken(id);
  if (action === "download-report") return downloadReport(id);
  if (action === "export-data") return exportData();
  if (action === "reset-data") return resetData();

  if (action === "switch-profile") {
    if (data.family.some(p => p.id === id)) {
      data.selectedProfile = id;
      saveData();
      setPage("Dashboard");
      notify(`Now viewing ${selectedProfile().name}'s records.`);
    }
    return;
  }

  if (action === "complete-appointment") {
    const appointment = data.appointments.find(a => a.id === id && belongsToSelected(a));
    if (appointment) {
      appointment.status = "Completed";
      addActivity(`Marked appointment with ${appointment.doctor || "doctor"} completed`);
      saveData();
      renderPage();
      notify("Appointment marked completed.");
    }
    return;
  }

  const editActions = {
    "edit-medicine": ["medicine", "medicines"],
    "edit-appointment": ["appointment", "appointments"],
    "edit-report": ["report", "reports"],
    "edit-prescription": ["prescription", "prescriptions"],
    "edit-family": ["family", "family"]
  };

  if (editActions[action]) {
    const [type, collectionName] = editActions[action];
    const record = collections[type] || data[collectionName];
    const item = record.find(r => r.id === id && (type === "family" || belongsToSelected(r)));
    if (item) openForm(type, item);
    return;
  }

  const deleteActions = {
    "delete-medicine": ["medicines", "medicine"],
    "delete-appointment": ["appointments", "appointment"],
    "delete-report": ["reports", "report"],
    "delete-prescription": ["prescriptions", "prescription"],
    "delete-family": ["family", "profile"]
  };

  if (deleteActions[action]) {
    const [collectionName, label] = deleteActions[action];
    const item = data[collectionName].find(r => r.id === id);
    if (!item) return;

    if (label === "profile" && item.id === "self") return notify("The default profile cannot be deleted.");
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;

    data[collectionName] = data[collectionName].filter(r => r.id !== id);

    if (label === "profile") {
      const removedId = item.id;
      data.medicines = data.medicines.filter(r => r.profileId !== removedId);
      data.appointments = data.appointments.filter(r => r.profileId !== removedId);
      data.reports = data.reports.filter(r => r.profileId !== removedId);
      data.prescriptions = data.prescriptions.filter(r => r.profileId !== removedId);
      if (data.selectedProfile === removedId) data.selectedProfile = data.family[0]?.id || "self";
    }

    addActivity(`Deleted ${label}`);
    saveData();
    setPage(currentPage);
    notify(`${label.charAt(0).toUpperCase() + label.slice(1)} deleted.`);
  }
}

/* Event listeners: one delegated listener keeps dynamic tabs working */

document.addEventListener("click", event => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    event.preventDefault();
    setPage(pageButton.dataset.page);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    event.preventDefault();
    actionHandler(actionButton.dataset.action, actionButton.dataset.id);
  }
});

$("#headingAction").addEventListener("click", () => {
  const actions = {
    "Dashboard": "add-medicine",
    "Medicine Reminders": "add-medicine",
    "Health Reports": "add-report",
    "Appointments": "add-appointment",
    "Prescriptions": "add-prescription",
    "Family Profiles": "add-family",
    "Analytics": "add-medicine",
    "Settings": null
  };

  const action = actions[currentPage];
  if (action) actionHandler(action);
  else {
    saveData();
    notify("Settings are saved automatically.");
  }
});

$("#closeModal").addEventListener("click", closeForm);
$("#cancelModal").addEventListener("click", closeForm);
$("#modalForm").addEventListener("submit", saveForm);

$("#modalBackdrop").addEventListener("click", event => {
  if (event.target === $("#modalBackdrop")) closeForm();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !$("#modalBackdrop").hidden) closeForm();
});

$("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

$("#notificationBtn").addEventListener("click", () => {
  const pending = medicineRecords().filter(m => m.status !== "Stopped" && !doseTakenToday(m));
  const upcoming = upcomingAppointments();
  notify(`${pending.length} medicine(s) not marked taken today · ${upcoming.length} upcoming appointment(s).`);
});

$("#pageContent").addEventListener("input", event => {
  if (event.target.id === "medicineSearch" || event.target.id === "medicineFilter") filterMedicines();
  if (event.target.id === "appointmentSearch" || event.target.id === "appointmentFilter") filterAppointments();
  if (event.target.id === "reportSearch") filterReports();
});

$("#pageContent").addEventListener("change", event => {
  if (event.target.id === "reportFile") handleReportUpload(event.target.files[0]);
  if (event.target.id === "importData") importData(event.target.files[0]);

  if (event.target.dataset.setting) {
    data.settings[event.target.dataset.setting] = event.target.checked;
    saveData();
    notify("Preference saved.");
  }

  if (event.target.id === "medicineFilter") filterMedicines();
  if (event.target.id === "appointmentFilter") filterAppointments();
});

/* Initialisation */

$("#todayLabel").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "short", day: "numeric", month: "short"
});

setPage("Dashboard");
