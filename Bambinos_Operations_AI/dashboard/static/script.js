/*
 * dashboard/static/script.js
 * Fetches data from the FastAPI endpoints and renders KPI cards, charts and tables.
 * All CSV values are inserted with textContent (never innerHTML), so data cannot inject HTML.
 */
(() => {
  "use strict";

  const PAGE_SIZE = 10;
  const NUMBER_RE = /^-?\d+(\.\d+)?$/;

  // ---------------------------------------------------------------- helpers
  const $ = (sel) => document.querySelector(sel);

  /** Tiny DOM builder: h("td", {class: "x"}, "text", childNode) */
  function h(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
    for (const child of children) {
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  async function getJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
      let detail = response.statusText;
      try { detail = (await response.json()).detail || detail; } catch (_) { /* not JSON */ }
      throw new Error(`${url} returned ${response.status}: ${detail}`);
    }
    return response.json();
  }

  function labelFor(key) {
    return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 1800);
  }

  function splitReasons(value) {
    return String(value || "").split("|").map((s) => s.trim()).filter(Boolean);
  }

  // ------------------------------------------------------------------ state
  let searchText = "";
  let reasonFilter = "";
  let reasonDescriptions = {};

  const tables = {
    approved: {
      endpoint: "/api/approved", label: "auto_approved.csv", useReason: false,
      columns: null, rows: [], status: "ok", page: 1, sortKey: null, sortDir: "asc",
    },
    exceptions: {
      endpoint: "/api/exceptions", label: "flagged_exceptions.csv", useReason: true,
      columns: null, rows: [], status: "ok", page: 1, sortKey: null, sortDir: "asc",
      expanded: new Set(),
    },
    messages: {
      endpoint: "/api/messages", label: "followup_messages.csv", useReason: true,
      // Fixed display columns for messages (these are real columns in the CSV)
      columns: [
        { key: "faculty_form_id", label: "Form ID" },
        { key: "invoice_id", label: "Invoice ID" },
        { key: "student_id", label: "Student ID" },
        { key: "reason_codes", label: "Exception reason" },
        { key: "followup_message", label: "Follow-up message" },
        { key: "__copy", label: "Copy", sortable: false },
      ],
      rows: [], status: "ok", page: 1, sortKey: null, sortDir: "asc",
    },
  };

  // --------------------------------------------------------- table pipeline
  function visibleRows(t) {
    let rows = t.rows;
    const needle = searchText.trim().toLowerCase();
    if (needle) {
      rows = rows.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(needle)));
    }
    if (t.useReason && reasonFilter) {
      rows = rows.filter((row) => splitReasons(row.reason_codes).includes(reasonFilter));
    }
    if (t.sortKey) {
      const key = t.sortKey;
      const dir = t.sortDir === "asc" ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const x = String(a[key] ?? ""), y = String(b[key] ?? "");
        if (NUMBER_RE.test(x) && NUMBER_RE.test(y)) return (parseFloat(x) - parseFloat(y)) * dir;
        return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" }) * dir;
      });
    }
    return rows;
  }

  function columnsFor(t) {
    const base = t.columns || [];
    const cols = base.map((c) => (typeof c === "string" ? { key: c, label: labelFor(c) } : c));
    return cols;
  }

  function decisionBadge(value) {
    const cls = value === "READY_FOR_SCHEDULING" ? "ok" : value === "MANUAL_REVIEW" ? "warn" : "neutral";
    return h("span", { class: `badge ${cls}`, text: labelFor(String(value).toLowerCase()) });
  }

  function reasonBadges(value) {
    const wrap = document.createElement("div");
    splitReasons(value).forEach((code) => wrap.append(h("span", { class: "badge reason", text: code })));
    return wrap;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {          // fallback for older browsers
      const area = h("textarea", { style: "position:fixed;opacity:0" });
      area.value = text;
      document.body.append(area);
      area.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); }
      catch (err) { reject(err); }
      finally { area.remove(); }
    });
  }

  function buildCell(t, key, row) {
    if (key === "__copy") {
      const btn = h("button", { class: "btn ghost small", type: "button", text: "Copy" });
      btn.addEventListener("click", async () => {
        try { await copyText(row.followup_message || ""); showToast("Message copied"); }
        catch (_) { showToast("Could not copy. Select the text manually."); }
      });
      return h("td", {}, btn);
    }
    const value = row[key] ?? "";
    if (key === "reason_codes") return h("td", {}, reasonBadges(value));
    if (key === "decision") return h("td", {}, decisionBadge(value));
    if (key === "followup_message") return h("td", { class: "msg", text: value });
    const mono = /(_id|^id)$/.test(key) ? "mono" : "";
    return h("td", { class: mono, text: value });
  }

  function detailRow(t, row, colSpan) {
    const codes = splitReasons(row.reason_codes);
    const list = h("ul", { class: "detail-list" });
    codes.forEach((code) => {
      list.append(h("li", {},
        h("span", { class: "badge reason", text: code }),
        h("span", { text: reasonDescriptions[code] || "No description available. Review manually." })));
    });
    const cell = h("td", { colspan: String(colSpan) }, h("div", { class: "detail-title", text: "Why this record was flagged" }), list);
    const message = tables.messages.rows.find((m) => m.faculty_form_id === row.faculty_form_id);
    if (message && message.followup_message) {
      cell.append(h("div", { class: "detail-title", text: "Draft follow-up message" }),
                  h("div", { text: message.followup_message }));
    }
    return h("tr", { class: "detail" }, cell);
  }

  function renderTable(key) {
    const t = tables[key];
    const head = $(`#${key}-head`), body = $(`#${key}-body`), pager = $(`#${key}-pager`);
    const cols = columnsFor(t);
    const hasToggle = key === "exceptions";
    const span = cols.length + (hasToggle ? 1 : 0) || 1;

    // Header with sortable buttons
    head.replaceChildren();
    const tr = document.createElement("tr");
    if (hasToggle) tr.append(h("th", { "aria-label": "Details" }));
    cols.forEach((col) => {
      const th = h("th", { scope: "col" });
      if (col.sortable === false) {
        th.textContent = col.label;
      } else {
        const sorted = t.sortKey === col.key;
        th.setAttribute("aria-sort", sorted ? (t.sortDir === "asc" ? "ascending" : "descending") : "none");
        const arrow = h("span", { class: "arrow", "aria-hidden": "true", text: sorted ? (t.sortDir === "asc" ? "▲" : "▼") : "▲▼" });
        const btn = h("button", { type: "button" }, col.label, arrow);
        btn.addEventListener("click", () => {
          if (t.sortKey === col.key) t.sortDir = t.sortDir === "asc" ? "desc" : "asc";
          else { t.sortKey = col.key; t.sortDir = "asc"; }
          renderTable(key);
        });
        th.append(btn);
      }
      tr.append(th);
    });
    head.append(tr);

    // Body
    const rows = visibleRows(t);
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    t.page = Math.min(Math.max(t.page, 1), pages);
    const start = (t.page - 1) * PAGE_SIZE;
    const slice = rows.slice(start, start + PAGE_SIZE);

    body.replaceChildren();
    if (!slice.length) {
      let text = "No records match the current filters.";
      if (t.status === "missing") text = `${t.label} was not found in the output folder. Run the reconciliation scripts first.`;
      else if (t.status === "error") text = `${t.label} could not be read. Check the server log.`;
      else if (!t.rows.length) text = `${t.label} contains no records.`;
      body.append(h("tr", {}, h("td", { class: "empty-cell", colspan: String(span), text })));
    }
    slice.forEach((row) => {
      const rowKey = row.faculty_form_id || JSON.stringify(row);
      const tr = document.createElement("tr");
      if (hasToggle) {
        const open = t.expanded.has(rowKey);
        const toggle = h("button", { class: "toggle", type: "button", "aria-expanded": String(open), "aria-label": "Show reason details", text: open ? "−" : "+" });
        toggle.addEventListener("click", () => {
          open ? t.expanded.delete(rowKey) : t.expanded.add(rowKey);
          renderTable(key);
        });
        tr.append(h("td", {}, toggle));
      }
      cols.forEach((col) => tr.append(buildCell(t, col.key, row)));
      body.append(tr);
      if (hasToggle && t.expanded.has(rowKey)) body.append(detailRow(t, row, span));
    });

    // Count badge + pager
    $(`#${key}-count`).textContent = rows.length;
    pager.replaceChildren();
    const from = rows.length ? start + 1 : 0;
    const to = Math.min(start + PAGE_SIZE, rows.length);
    const prev = h("button", { class: "btn ghost small", type: "button", text: "Previous" });
    const next = h("button", { class: "btn ghost small", type: "button", text: "Next" });
    prev.disabled = t.page <= 1;
    next.disabled = t.page >= pages;
    prev.addEventListener("click", () => { t.page -= 1; renderTable(key); });
    next.addEventListener("click", () => { t.page += 1; renderTable(key); });
    pager.append(
      h("span", { text: `Showing ${from}–${to} of ${rows.length}` }),
      h("div", { class: "btns" }, prev, h("span", { text: `Page ${t.page} of ${pages}` }), next));
  }

  const renderAllTables = () => Object.keys(tables).forEach(renderTable);

  // ----------------------------------------------------------------- charts
  const charts = {};
  const PALETTE = ["#6ea8fe", "#f6a93b", "#34d3b0", "#ff6b7a", "#b794f6", "#f78fb3", "#9ad66b", "#5ad1e6"];

  function setupCharts() {
    Chart.defaults.color = "#8d9bb8";
    Chart.defaults.font.family = '"DM Sans", "Segoe UI", sans-serif';
    Chart.defaults.borderColor = "#223052";

    charts.split = new Chart($("#chart-split"), {
      type: "doughnut",
      data: { labels: [], datasets: [{ data: [], backgroundColor: ["#34d3b0", "#f6a93b"], borderColor: "#111a30", borderWidth: 3 }] },
      options: { maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom" } } },
    });
    const barOptions = {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } },
    };
    charts.reasons = new Chart($("#chart-reasons"), {
      type: "bar",
      data: { labels: [], datasets: [{ data: [], backgroundColor: "#6ea8fe", borderRadius: 4 }] },
      options: { ...barOptions, indexAxis: "y",
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } },
    });
    charts.decisions = new Chart($("#chart-decisions"), {
      type: "bar",
      data: { labels: [], datasets: [{ data: [], backgroundColor: PALETTE, borderRadius: 4 }] },
      options: barOptions,
    });
  }

  function updateChart(chart, series, emptyId) {
    chart.data.labels = series.labels;
    chart.data.datasets[0].data = series.values;
    chart.update();
    const total = series.values.reduce((a, b) => a + b, 0);
    $(emptyId).hidden = total > 0;
  }

  let chartRequest = 0;
  async function loadCharts() {
    const ticket = ++chartRequest;                 // ignore out-of-date responses
    const params = new URLSearchParams();
    if (searchText.trim()) params.set("q", searchText.trim());
    if (reasonFilter) params.set("reason", reasonFilter);
    const data = await getJSON(`/api/charts?${params}`);
    if (ticket !== chartRequest) return;
    updateChart(charts.split, data.status_split, "#empty-split");
    updateChart(charts.reasons, data.reasons, "#empty-reasons");
    updateChart(charts.decisions, data.decisions, "#empty-decisions");
  }

  // -------------------------------------------------------------------- KPIs
  function renderSummary(s) {
    $("#kpi-total").textContent = s.total_records;
    $("#kpi-approved").textContent = s.auto_approved;
    $("#kpi-flagged").textContent = s.flagged;
    $("#kpi-rate").textContent = `${s.approval_rate}%`;
    $("#kpi-messages").textContent = s.followups_generated;
    $("#last-updated").textContent = s.last_updated ? new Date(s.last_updated).toLocaleString() : "no output files yet";

    const problems = Object.entries(s.file_status).filter(([, st]) => st !== "ok");
    const banner = $("#file-banner");
    if (problems.length) {
      banner.textContent = "Some output files need attention: " +
        problems.map(([name, st]) => `${name} (${st})`).join(", ") +
        ". Run src/reconciliation.py and then src/message_generator.py, then press Refresh.";
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  function fillReasonFilter(reasons) {
    const select = $("#reason-filter");
    const keep = reasonFilter;
    select.replaceChildren(h("option", { value: "", text: "All reasons" }));
    reasons.forEach((r) => select.append(h("option", { value: r, text: r })));
    if (reasons.includes(keep)) select.value = keep; else { select.value = ""; reasonFilter = ""; }
  }

  // ---------------------------------------------------------------- loading
  function showError(message) {
    const banner = $("#error-banner");
    banner.textContent = message;
    banner.hidden = !message;
  }

  async function loadAll() {
    const loading = $("#loading");
    const button = $("#refresh-btn");
    loading.hidden = false;
    button.disabled = true;
    showError("");
    try {
      const [summary, approved, exceptions, messages] = await Promise.all([
        getJSON("/api/summary"), getJSON("/api/approved"),
        getJSON("/api/exceptions"), getJSON("/api/messages"),
      ]);
      renderSummary(summary);

      tables.approved.columns = approved.columns;
      tables.approved.rows = approved.records;
      tables.approved.status = approved.status;

      tables.exceptions.columns = exceptions.columns;
      tables.exceptions.rows = exceptions.records;
      tables.exceptions.status = exceptions.status;
      reasonDescriptions = exceptions.reason_descriptions || {};
      fillReasonFilter(exceptions.reasons || []);

      tables.messages.rows = messages.records;
      tables.messages.status = messages.status;

      Object.values(tables).forEach((t) => { t.page = 1; });
      renderAllTables();
      await loadCharts();
    } catch (err) {
      showError(`Could not load dashboard data. ${err.message}. Is the server running? Press Refresh to retry.`);
    } finally {
      loading.hidden = true;
      button.disabled = false;
    }
  }

  async function onFiltersChanged() {
    Object.values(tables).forEach((t) => { t.page = 1; });
    renderAllTables();
    try { await loadCharts(); } catch (err) { showError(`Could not update charts. ${err.message}`); }
  }

  // ----------------------------------------------------------------- wiring
  function updateClock() {
    $("#clock").textContent = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
  }

  function setupNavHighlight() {
    const links = [...document.querySelectorAll("#nav a")];
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`));
        }
      });
    }, { rootMargin: "-20% 0px -65% 0px" });
    links.forEach((a) => { const target = $(a.getAttribute("href")); if (target) observer.observe(target); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupCharts();
    updateClock();
    setInterval(updateClock, 1000);
    setupNavHighlight();

    let debounce;
    $("#global-search").addEventListener("input", (e) => {
      searchText = e.target.value;
      clearTimeout(debounce);
      debounce = setTimeout(onFiltersChanged, 200);
    });
    $("#reason-filter").addEventListener("change", (e) => {
      reasonFilter = e.target.value;
      onFiltersChanged();
    });
    $("#refresh-btn").addEventListener("click", loadAll);

    loadAll();
  });
})();
