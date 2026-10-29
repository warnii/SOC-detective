const cases = [];
let selectedCaseId = null;
let selectedCaseDetails = null;
let detailRequestId = 0;
let editingCaseId = null;

const caseList = document.querySelector("#incident-list");
const searchInput = document.querySelector("#search-input");
const severityFilter = document.querySelector("#severity-filter");
const statusFilter = document.querySelector("#status-filter");
const message = document.querySelector("#persistence-message");
const detailContent = document.querySelector("#detail-content");
const newCaseDialog = document.querySelector("#new-case-dialog");
const newCaseForm = document.querySelector("#new-case-form");
const analystInput = document.querySelector("#analyst-name");
const analystAvatar = document.querySelector("#analyst-avatar");
const analystStorageKey = "soc-detective-analyst-name-v1";

function getAnalystName() {
  return analystInput.value.trim() || "Demo analyst";
}

function initializeAnalystName() {
  try {
    const savedName = localStorage.getItem(analystStorageKey);
    if (savedName) analystInput.value = savedName;
  } catch {
    showMessage("Analyst name cannot be restored from browser storage.", true);
  }
  updateAnalystAvatar();
}

function updateAnalystAvatar() {
  const name = getAnalystName();
  analystAvatar.textContent = Array.from(name)[0].toUpperCase();
  analystInput.setAttribute("aria-label", `Analyst display name, currently ${name}`);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  return body;
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.hidden = false;
}

function formatDetected(createdAt) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} day${hours >= 48 ? "s" : ""} ago`;
}

function getVisibleCases() {
  const search = searchInput.value.trim().toLowerCase();
  const severity = severityFilter.value;
  const status = statusFilter.value;
  return cases.filter((caseRecord) => {
    const matchesSearch = !search || [
      caseRecord.id,
      caseRecord.title,
      caseRecord.source,
      caseRecord.host,
      caseRecord.user,
      caseRecord.indicator,
    ].some((value) => value.toLowerCase().includes(search));
    return matchesSearch
      && (severity === "all" || caseRecord.severity === severity)
      && (status === "all" || caseRecord.status === status);
  });
}

function renderMetrics() {
  document.querySelector("#open-count").textContent =
    cases.filter((caseRecord) => caseRecord.status === "Open").length;
  document.querySelector("#investigating-count").textContent =
    cases.filter((caseRecord) => caseRecord.status === "Investigating").length;
  document.querySelector("#priority-count").textContent =
    cases.filter((caseRecord) => caseRecord.severity === "Critical" || caseRecord.severity === "High").length;
  renderOverview();
}

function renderOverview() {
  const levels = [
    { name: "Critical", className: "critical" },
    { name: "High", className: "high" },
    { name: "Medium", className: "medium" },
    { name: "Low", className: "low" },
  ];
  const breakdown = document.querySelector("#severity-breakdown");
  breakdown.replaceChildren();
  document.querySelector("#severity-total").textContent =
    `${cases.length} ${cases.length === 1 ? "case" : "cases"}`;

  for (const level of levels) {
    const count = cases.filter((caseRecord) => caseRecord.severity === level.name).length;
    const row = document.createElement("div");
    row.className = "severity-row";
    const label = document.createElement("span");
    label.className = `severity-label ${level.className}`;
    label.textContent = level.name;
    const track = document.createElement("div");
    track.className = "severity-track";
    const bar = document.createElement("span");
    bar.className = `severity-bar ${level.className}`;
    const percentage = cases.length ? Math.round((count / cases.length) * 100) : 0;
    bar.style.width = `${percentage}%`;
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", `${level.name} cases`);
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(percentage));
    track.append(bar);
    const total = document.createElement("strong");
    total.textContent = String(count);
    row.append(label, track, total);
    breakdown.append(row);
  }

  const severityRank = { Critical: 0, High: 1 };
  const watchlist = cases
    .filter((caseRecord) => caseRecord.status !== "Resolved" && severityRank[caseRecord.severity] !== undefined)
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]
      || Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(0, 5);
  const watchlistElement = document.querySelector("#priority-watchlist");
  watchlistElement.replaceChildren();
  document.querySelector("#watchlist-total").textContent =
    `${watchlist.length} ${watchlist.length === 1 ? "case" : "cases"}`;

  if (watchlist.length === 0) {
    const empty = document.createElement("li");
    empty.className = "watchlist-empty";
    empty.textContent = "No unresolved critical or high cases.";
    watchlistElement.append(empty);
    return;
  }

  for (const caseRecord of watchlist) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "watchlist-item";
    button.type = "button";
    const main = document.createElement("span");
    main.className = "watchlist-main";
    const title = document.createElement("strong");
    title.textContent = caseRecord.title;
    const metadata = document.createElement("span");
    metadata.textContent = `${caseRecord.id} · ${formatDetected(caseRecord.createdAt)}`;
    main.append(title, metadata);
    const badge = document.createElement("span");
    badge.className = `severity ${caseRecord.severity.toLowerCase()}`;
    badge.textContent = caseRecord.severity;
    button.append(main, badge);
    button.addEventListener("click", () => selectCase(caseRecord.id));
    item.append(button);
    watchlistElement.append(item);
  }
}

function renderList() {
  const visibleCases = getVisibleCases();
  caseList.replaceChildren();

  for (const caseRecord of visibleCases) {
    const row = document.createElement("tr");
    row.className = `incident-row${caseRecord.id === selectedCaseId ? " selected" : ""}`;
    row.tabIndex = 0;
    row.setAttribute("aria-label", `${caseRecord.title}, ${caseRecord.severity}, ${caseRecord.status}`);

    const titleCell = document.createElement("td");
    const title = document.createElement("span");
    title.className = "alert-name";
    title.textContent = caseRecord.title;
    const id = document.createElement("span");
    id.className = "alert-id";
    id.textContent = caseRecord.id;
    titleCell.append(title, id);

    const severityCell = document.createElement("td");
    const severity = document.createElement("span");
    severity.className = `severity ${caseRecord.severity.toLowerCase()}`;
    severity.textContent = caseRecord.severity;
    severityCell.append(severity);

    const sourceCell = document.createElement("td");
    sourceCell.textContent = caseRecord.source;
    const detectedCell = document.createElement("td");
    detectedCell.textContent = formatDetected(caseRecord.createdAt);
    const statusCell = document.createElement("td");
    const status = document.createElement("span");
    status.className = `status-pill ${caseRecord.status.toLowerCase()}`;
    status.textContent = caseRecord.status;
    statusCell.append(status);

    row.append(titleCell, severityCell, sourceCell, detectedCell, statusCell);
    row.addEventListener("click", () => selectCase(caseRecord.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCase(caseRecord.id);
      }
    });
    caseList.append(row);
  }

  document.querySelector("#result-count").textContent =
    `${visibleCases.length} ${visibleCases.length === 1 ? "case" : "cases"}`;
  document.querySelector("#empty-state").hidden = visibleCases.length > 0;
}

function addDetailSection(parent, headingText, content) {
  const section = document.createElement("section");
  section.className = "detail-section";
  const heading = document.createElement("h3");
  heading.textContent = headingText;
  section.append(heading, content);
  parent.append(section);
  return section;
}

function makeFact(label, value) {
  const fact = document.createElement("div");
  fact.className = "fact";
  const factLabel = document.createElement("span");
  factLabel.textContent = label;
  const factValue = document.createElement("strong");
  factValue.textContent = value || "Not provided";
  fact.append(factLabel, factValue);
  return fact;
}

function renderDetails() {
  detailContent.replaceChildren();
  const caseId = document.querySelector("#detail-id");
  if (!selectedCaseDetails) {
    caseId.textContent = "";
    const placeholder = document.createElement("div");
    placeholder.className = "detail-placeholder";
    const icon = document.createElement("span");
    icon.className = "placeholder-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⌕";
    const title = document.createElement("h2");
    title.id = "detail-title";
    title.textContent = "Select a case";
    const description = document.createElement("p");
    description.textContent = "Choose a case from the queue to review evidence, add notes, and track its response.";
    placeholder.append(icon, title, description);
    detailContent.append(placeholder);
    return;
  }

  const caseRecord = selectedCaseDetails;
  caseId.textContent = caseRecord.id;
  const content = document.createElement("div");
  content.className = "detail-content";

  const severity = document.createElement("span");
  severity.className = `severity detail-severity ${caseRecord.severity.toLowerCase()}`;
  severity.textContent = caseRecord.severity;
  const title = document.createElement("h2");
  title.id = "detail-title";
  title.textContent = caseRecord.title;
  const subtitle = document.createElement("p");
  subtitle.className = "detail-subtitle";
  subtitle.textContent = `${caseRecord.source} · ${formatDetected(caseRecord.createdAt)}`;
  content.append(severity, title, subtitle);

  const description = document.createElement("p");
  description.textContent = caseRecord.description || "No summary provided.";
  addDetailSection(content, "Analyst summary", description);

  const facts = document.createElement("div");
  facts.className = "detail-facts";
  facts.append(
    makeFact("Account", caseRecord.user),
    makeFact("Asset", caseRecord.host),
    makeFact("Indicator", caseRecord.indicator),
  );
  addDetailSection(content, "Observables", facts);

  const evidenceList = document.createElement("ol");
  evidenceList.className = "activity-list";
  if (caseRecord.evidence.length === 0) {
    const empty = document.createElement("li");
    empty.className = "activity-empty";
    empty.textContent = "No evidence references recorded.";
    evidenceList.append(empty);
  }
  for (const evidence of caseRecord.evidence) {
    const item = document.createElement("li");
    const evidenceTitle = document.createElement("strong");
    evidenceTitle.textContent = evidence.label;
    const evidenceDetails = document.createElement("p");
    evidenceDetails.textContent = evidence.details;
    const metadata = document.createElement("span");
    metadata.textContent = `${evidence.analyst} · ${new Date(evidence.createdAt).toLocaleString()}`;
    item.append(evidenceTitle, evidenceDetails, metadata);
    evidenceList.append(item);
  }
  addDetailSection(content, "Evidence references", evidenceList);

  const evidenceForm = document.createElement("form");
  evidenceForm.className = "note-form";
  const evidenceLabel = document.createElement("label");
  evidenceLabel.htmlFor = "evidence-label";
  evidenceLabel.textContent = "Add evidence reference";
  const evidenceTitleInput = document.createElement("input");
  evidenceTitleInput.id = "evidence-label";
  evidenceTitleInput.name = "label";
  evidenceTitleInput.maxLength = 120;
  evidenceTitleInput.placeholder = "Evidence title";
  evidenceTitleInput.required = true;
  const evidenceDetailsInput = document.createElement("textarea");
  evidenceDetailsInput.name = "details";
  evidenceDetailsInput.rows = 2;
  evidenceDetailsInput.maxLength = 2000;
  evidenceDetailsInput.placeholder = "What does this evidence show?";
  evidenceDetailsInput.required = true;
  const evidenceButton = document.createElement("button");
  evidenceButton.className = "detail-action secondary-action";
  evidenceButton.type = "submit";
  evidenceButton.textContent = "Save evidence";
  evidenceForm.append(evidenceLabel, evidenceTitleInput, evidenceDetailsInput, evidenceButton);
  evidenceForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addEvidence(caseRecord.id, evidenceTitleInput.value, evidenceDetailsInput.value);
  });
  content.append(evidenceForm);

  const historyList = document.createElement("ol");
  historyList.className = "activity-list";
  for (const entry of caseRecord.history) {
    const item = document.createElement("li");
    const action = document.createElement("strong");
    action.textContent = entry.fromStatus
      ? `${entry.fromStatus} → ${entry.toStatus}`
      : `Case opened · ${entry.toStatus}`;
    const metadata = document.createElement("span");
    metadata.textContent = `${entry.analyst} · ${new Date(entry.createdAt).toLocaleString()}`;
    item.append(action, metadata);
    historyList.append(item);
  }
  addDetailSection(content, "Status history", historyList);

  const notesList = document.createElement("ol");
  notesList.className = "activity-list";
  if (caseRecord.notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "activity-empty";
    empty.textContent = "No investigation notes yet.";
    notesList.append(empty);
  }
  for (const note of caseRecord.notes) {
    const item = document.createElement("li");
    const noteText = document.createElement("p");
    noteText.textContent = note.content;
    const metadata = document.createElement("span");
    metadata.textContent = `${note.analyst} · ${new Date(note.createdAt).toLocaleString()}`;
    item.append(noteText, metadata);
    notesList.append(item);
  }
  addDetailSection(content, "Investigation notes", notesList);

  const noteForm = document.createElement("form");
  noteForm.className = "note-form";
  const noteLabel = document.createElement("label");
  noteLabel.htmlFor = "note-input";
  noteLabel.textContent = "Add an analyst note";
  const noteInput = document.createElement("textarea");
  noteInput.id = "note-input";
  noteInput.name = "content";
  noteInput.rows = 3;
  noteInput.maxLength = 2000;
  noteInput.placeholder = "Record findings, validation, or next steps...";
  noteInput.required = true;
  const noteButton = document.createElement("button");
  noteButton.className = "detail-action secondary-action";
  noteButton.type = "submit";
  noteButton.textContent = "Add note";
  noteForm.append(noteLabel, noteInput, noteButton);
  noteForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addNote(caseRecord.id, noteInput.value);
  });
  content.append(noteForm);

  const editButton = document.createElement("button");
  editButton.className = "detail-action secondary-action";
  editButton.type = "button";
  editButton.textContent = "Edit case details";
  editButton.addEventListener("click", () => openEditCase(caseRecord));
  content.append(editButton);

  const action = document.createElement("button");
  action.className = "detail-action";
  action.type = "button";
  if (caseRecord.status === "Open") {
    action.textContent = "Start investigation";
    action.addEventListener("click", () => updateCaseStatus(caseRecord.id, "Investigating"));
  } else if (caseRecord.status === "Investigating") {
    action.textContent = "Mark resolved";
    action.addEventListener("click", () => updateCaseStatus(caseRecord.id, "Resolved"));
  } else {
    action.textContent = "Case resolved";
    action.disabled = true;
  }
  content.append(action);
  detailContent.append(content);
}

async function refreshCases() {
  const results = await apiRequest("/api/cases");
  cases.splice(0, cases.length, ...results);
  renderMetrics();
  renderList();
  const selectedId = selectedCaseId;
  if (selectedId) {
    await selectCase(selectedId);
  } else {
    renderDetails();
  }
}

async function selectCase(id) {
  selectedCaseId = id;
  const requestId = ++detailRequestId;
  renderList();
  try {
    const result = await apiRequest(`/api/cases/${encodeURIComponent(id)}`);
    if (requestId !== detailRequestId) return;
    selectedCaseDetails = result;
    renderDetails();
  } catch (error) {
    if (requestId !== detailRequestId) return;
    showMessage(error.message, true);
  }
}

async function updateCaseStatus(id, status) {
  try {
    selectedCaseDetails = await apiRequest(`/api/cases/${encodeURIComponent(id)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, analyst: getAnalystName() }),
    });
    showMessage(`Case ${id} moved to ${status}.`);
    await refreshCases();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function addNote(id, content) {
  try {
    selectedCaseDetails = await apiRequest(`/api/cases/${encodeURIComponent(id)}/notes`, {
      method: "POST",
      body: JSON.stringify({ content, analyst: getAnalystName() }),
    });
    showMessage("Investigation note saved.");
    renderDetails();
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function addEvidence(id, label, details) {
  try {
    selectedCaseDetails = await apiRequest(`/api/cases/${encodeURIComponent(id)}/evidence`, {
      method: "POST",
      body: JSON.stringify({ label, details, analyst: getAnalystName() }),
    });
    showMessage("Evidence reference saved.");
    renderDetails();
  } catch (error) {
    showMessage(error.message, true);
  }
}

function openEditCase(caseRecord) {
  editingCaseId = caseRecord.id;
  newCaseForm.elements.title.value = caseRecord.title;
  newCaseForm.elements.severity.value = caseRecord.severity;
  newCaseForm.elements.source.value = caseRecord.source;
  newCaseForm.elements.description.value = caseRecord.description;
  newCaseForm.elements.user.value = caseRecord.user;
  newCaseForm.elements.host.value = caseRecord.host;
  newCaseForm.elements.indicator.value = caseRecord.indicator;
  document.querySelector("#new-case-title").textContent = "Edit case details";
  newCaseForm.querySelector('[type="submit"]').textContent = "Save changes";
  newCaseDialog.showModal();
}

function resetCaseForm() {
  editingCaseId = null;
  newCaseForm.reset();
  document.querySelector("#new-case-title").textContent = "Create a case";
  newCaseForm.querySelector('[type="submit"]').textContent = "Create case";
}

newCaseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(newCaseForm);
  const payload = { ...Object.fromEntries(formData.entries()), analyst: getAnalystName() };
  const caseId = editingCaseId;
  try {
    const saved = await apiRequest(caseId ? `/api/cases/${encodeURIComponent(caseId)}` : "/api/cases", {
      method: caseId ? "PATCH" : "POST",
      body: JSON.stringify(payload),
    });
    newCaseDialog.close();
    resetCaseForm();
    showMessage(caseId ? `Case ${saved.id} updated.` : `Case ${saved.id} created.`);
    await refreshCases();
    await selectCase(saved.id);
  } catch (error) {
    showMessage(error.message, true);
  }
});

document.querySelector("#new-case-button").addEventListener("click", () => {
  resetCaseForm();
  newCaseDialog.showModal();
});
document.querySelector("#close-case-dialog").addEventListener("click", () => {
  newCaseDialog.close();
  resetCaseForm();
});
document.querySelector("#cancel-case-dialog").addEventListener("click", () => {
  newCaseDialog.close();
  resetCaseForm();
});
searchInput.addEventListener("input", renderList);
severityFilter.addEventListener("change", renderList);
statusFilter.addEventListener("change", renderList);
analystInput.addEventListener("input", updateAnalystAvatar);
analystInput.addEventListener("change", () => {
  const analyst = getAnalystName();
  analystInput.value = analyst;
  updateAnalystAvatar();
  try {
    localStorage.setItem(analystStorageKey, analyst);
  } catch {
    showMessage("Could not save the analyst name in this browser.", true);
  }
});

initializeAnalystName();
refreshCases().catch((error) => {
  showMessage(`Could not load cases: ${error.message}`, true);
});
