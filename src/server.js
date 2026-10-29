import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultDatabasePath = process.env.SOC_DB_PATH
  ? resolve(process.env.SOC_DB_PATH)
  : join(projectRoot, "data", "soc-detective.sqlite");
const validSeverities = new Set(["Critical", "High", "Medium", "Low"]);
const validStatuses = new Set(["Open", "Investigating", "Resolved"]);
const maxRequestBytes = 16 * 1024;
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

const seedCases = [
  {
    id: "INC-2408",
    title: "Repeated failed sign-ins",
    severity: "High",
    source: "Identity provider",
    ageMinutes: 8,
    status: "Open",
    host: "idp-gateway-02",
    user: "j.chen",
    description: "Multiple failed authentication attempts were recorded for one account from an unfamiliar network. Confirm whether the activity is expected before taking action.",
    indicator: "203.0.113.42",
  },
  {
    id: "INC-2407",
    title: "Unusual outbound data transfer",
    severity: "Critical",
    source: "Network monitor",
    ageMinutes: 22,
    status: "Investigating",
    host: "workstation-17",
    user: "m.singh",
    description: "A workstation sent an unusually large volume of data to an external destination. Review the process and destination with the endpoint owner.",
    indicator: "198.51.100.24",
  },
  {
    id: "INC-2406",
    title: "Endpoint protection disabled",
    severity: "High",
    source: "Endpoint security",
    ageMinutes: 60,
    status: "Open",
    host: "laptop-044",
    user: "a.patel",
    description: "Endpoint protection reported a disabled control. Verify whether this was an approved maintenance action and check the device's current health.",
    indicator: "laptop-044.corp.example",
  },
  {
    id: "INC-2405",
    title: "Suspicious PowerShell activity",
    severity: "Medium",
    source: "Endpoint detection",
    ageMinutes: 120,
    status: "Investigating",
    host: "server-app-03",
    user: "svc-deploy",
    description: "A script execution pattern was flagged on an application server. Validate the deployment context and review the associated process tree.",
    indicator: "server-app-03",
  },
  {
    id: "INC-2404",
    title: "New administrator role assigned",
    severity: "Medium",
    source: "Cloud audit log",
    ageMinutes: 180,
    status: "Resolved",
    host: "cloud-console",
    user: "r.morgan",
    description: "An administrator role was assigned to a user account. The change was confirmed as part of an approved access request.",
    indicator: "cloud-console",
  },
  {
    id: "INC-2403",
    title: "Potential phishing email reported",
    severity: "Low",
    source: "Email security",
    ageMinutes: 300,
    status: "Open",
    host: "mail-gateway",
    user: "k.lee",
    description: "A user reported an email containing a suspicious link. Review the message and determine whether other recipients need to be notified.",
    indicator: "mail-gateway",
  },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createDatabase(databasePath = defaultDatabasePath) {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
      source TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Open', 'Investigating', 'Resolved')),
      host TEXT NOT NULL DEFAULT '',
      user TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      indicator TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      analyst TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      analyst TEXT NOT NULL,
      label TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS case_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      analyst TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const caseCount = db.prepare("SELECT COUNT(*) AS count FROM cases").get().count;
  if (caseCount === 0) {
    const insertCase = db.prepare(`
      INSERT INTO cases (id, title, severity, source, status, host, user, description, indicator, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertHistory = db.prepare(`
      INSERT INTO case_history (case_id, analyst, from_status, to_status, created_at)
      VALUES (?, 'System', NULL, ?, ?)
    `);
    runInTransaction(db, () => {
      for (const item of seedCases) {
        const now = new Date(Date.now() - item.ageMinutes * 60000).toISOString();
        insertCase.run(
          item.id,
          item.title,
          item.severity,
          item.source,
          item.status,
          item.host,
          item.user,
          item.description,
          item.indicator,
          now,
          now,
        );
        insertHistory.run(item.id, item.status, now);
      }
    });
  }
  return db;
}

function readJson(request) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxRequestBytes) {
        settled = true;
        rejectBody(new HttpError(413, "Request body is too large."));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      try {
        settled = true;
        resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        settled = true;
        rejectBody(new HttpError(400, "Request body must be valid JSON."));
      }
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      rejectBody(error);
    });
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function runInTransaction(database, operation) {
  database.exec("BEGIN");
  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function getCase(db, id) {
  return db.prepare(`
    SELECT id, title, severity, source, status, host, user, description, indicator,
      created_at AS createdAt, updated_at AS updatedAt
    FROM cases WHERE id = ?
  `).get(id);
}

function getCaseDetails(db, id) {
  const caseRecord = getCase(db, id);
  if (!caseRecord) {
    throw new HttpError(404, "Case not found.");
  }
  const notes = db.prepare(`
    SELECT id, analyst, content, created_at AS createdAt
    FROM notes WHERE case_id = ? ORDER BY id DESC
  `).all(id);
  const history = db.prepare(`
    SELECT id, analyst, from_status AS fromStatus, to_status AS toStatus, created_at AS createdAt
    FROM case_history WHERE case_id = ? ORDER BY id DESC
  `).all(id);
  const evidence = db.prepare(`
    SELECT id, analyst, label, details, created_at AS createdAt
    FROM evidence WHERE case_id = ? ORDER BY id DESC
  `).all(id);
  return { ...caseRecord, notes, history, evidence };
}

function validateText(value, field, { required = false, max = 500 } = {}) {
  if (typeof value !== "string") {
    if (!required && value === undefined) {
      return "";
    }
    throw new HttpError(400, `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (required && !normalized) {
    throw new HttpError(400, `${field} is required.`);
  }
  if (normalized.length > max) {
    throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
  }
  return normalized;
}

function createCase(db, payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  const title = validateText(payload.title, "Title", { required: true, max: 120 });
  const severity = validateText(payload.severity, "Severity", { required: true, max: 20 });
  if (!validSeverities.has(severity)) {
    throw new HttpError(400, "Severity must be Critical, High, Medium, or Low.");
  }
  const source = validateText(payload.source ?? "Analyst reported", "Source", { required: true, max: 80 });
  const description = validateText(payload.description ?? "", "Description", { max: 2000 });
  const user = validateText(payload.user ?? "", "Account", { max: 120 });
  const host = validateText(payload.host ?? "", "Asset", { max: 120 });
  const indicator = validateText(payload.indicator ?? "", "Indicator", { max: 200 });
  const analyst = validateText(payload.analyst ?? "Analyst", "Analyst", { required: true, max: 80 });
  const now = new Date().toISOString();
  const id = `CASE-${randomUUID()}`;
  const insertCase = db.prepare(`
    INSERT INTO cases (id, title, severity, source, status, host, user, description, indicator, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Open', ?, ?, ?, ?, ?, ?)
  `);
  const insertHistory = db.prepare(`
    INSERT INTO case_history (case_id, analyst, from_status, to_status, created_at)
    VALUES (?, ?, NULL, 'Open', ?)
  `);
  runInTransaction(db, () => {
    insertCase.run(id, title, severity, source, host, user, description, indicator, now, now);
    insertHistory.run(id, analyst, now);
  });
  return getCaseDetails(db, id);
}

function updateCaseStatus(db, id, payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  const status = validateText(payload.status, "Status", { required: true, max: 30 });
  if (!validStatuses.has(status)) {
    throw new HttpError(400, "Status must be Open, Investigating, or Resolved.");
  }
  const incident = getCase(db, id);
  if (!incident) {
    throw new HttpError(404, "Case not found.");
  }
  const allowedNextStatus = { Open: "Investigating", Investigating: "Resolved", Resolved: null };
  if (allowedNextStatus[incident.status] !== status) {
    throw new HttpError(409, `Cannot move a ${incident.status} case to ${status}.`);
  }
  const analyst = validateText(payload.analyst ?? "Analyst", "Analyst", { required: true, max: 80 });
  const now = new Date().toISOString();
  runInTransaction(db, () => {
    db.prepare("UPDATE cases SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    db.prepare(`
      INSERT INTO case_history (case_id, analyst, from_status, to_status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, analyst, incident.status, status, now);
  });
  return getCaseDetails(db, id);
}

function updateCase(db, id, payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  const fields = {
    title: { column: "title", max: 120, required: true },
    severity: { column: "severity", max: 20, required: true },
    source: { column: "source", max: 80, required: true },
    description: { column: "description", max: 2000 },
    user: { column: "user", max: 120 },
    host: { column: "host", max: 120 },
    indicator: { column: "indicator", max: 200 },
  };
  const updates = [];
  for (const [field, rules] of Object.entries(fields)) {
    if (!Object.hasOwn(payload, field)) continue;
    const value = validateText(payload[field], field, rules);
    if (field === "severity" && !validSeverities.has(value)) {
      throw new HttpError(400, "Severity must be Critical, High, Medium, or Low.");
    }
    updates.push({ column: rules.column, value });
  }
  if (updates.length === 0) {
    throw new HttpError(400, "Provide at least one case field to update.");
  }
  if (!getCase(db, id)) {
    throw new HttpError(404, "Case not found.");
  }
  const now = new Date().toISOString();
  const assignments = updates.map(({ column }) => `${column} = ?`);
  const values = updates.map(({ value }) => value);
  assignments.push("updated_at = ?");
  values.push(now, id);
  db.prepare(`UPDATE cases SET ${assignments.join(", ")} WHERE id = ?`).run(...values);
  return getCaseDetails(db, id);
}

function addNote(db, id, payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  if (!getCase(db, id)) {
    throw new HttpError(404, "Case not found.");
  }
  const content = validateText(payload.content, "Note", { required: true, max: 2000 });
  const analyst = validateText(payload.analyst ?? "Analyst", "Analyst", { required: true, max: 80 });
  db.prepare("INSERT INTO notes (case_id, analyst, content, created_at) VALUES (?, ?, ?, ?)")
    .run(id, analyst, content, new Date().toISOString());
  return getCaseDetails(db, id);
}

function addEvidence(db, id, payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  if (!getCase(db, id)) {
    throw new HttpError(404, "Case not found.");
  }
  const label = validateText(payload.label, "Evidence title", { required: true, max: 120 });
  const details = validateText(payload.details, "Evidence details", { required: true, max: 2000 });
  const analyst = validateText(payload.analyst ?? "Analyst", "Analyst", { required: true, max: 80 });
  db.prepare("INSERT INTO evidence (case_id, analyst, label, details, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, analyst, label, details, new Date().toISOString());
  return getCaseDetails(db, id);
}

function serveStatic(response, pathname) {
  const entry = staticFiles.get(pathname);
  if (!entry) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  const [filename, contentType] = entry;
  const content = readFileSync(join(projectRoot, "public", filename));
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
  });
  response.end(content);
}

function createApp({ database = createDatabase() } = {}) {
  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const url = new URL(request.url, "http://localhost");

    try {
      if (url.pathname === "/api/cases" && request.method === "GET") {
        const cases = database.prepare(`
          SELECT id, title, severity, source, status, host, user, description, indicator, created_at AS createdAt, updated_at AS updatedAt
          FROM cases ORDER BY created_at DESC, id DESC
        `).all();
        sendJson(response, 200, cases);
        return;
      }
      if (url.pathname === "/api/cases" && request.method === "POST") {
        sendJson(response, 201, createCase(database, await readJson(request)));
        return;
      }

      const match = url.pathname.match(/^\/api\/cases\/([^/]+)(?:\/(status|notes|evidence))?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const action = match[2];
        if (!action && request.method === "GET") {
          sendJson(response, 200, getCaseDetails(database, id));
          return;
        }
        if (!action && request.method === "PATCH") {
          sendJson(response, 200, updateCase(database, id, await readJson(request)));
          return;
        }
        if (action === "status" && request.method === "PATCH") {
          sendJson(response, 200, updateCaseStatus(database, id, await readJson(request)));
          return;
        }
        if (action === "notes" && request.method === "POST") {
          sendJson(response, 201, addNote(database, id, await readJson(request)));
          return;
        }
        if (action === "evidence" && request.method === "POST") {
          sendJson(response, 201, addEvidence(database, id, await readJson(request)));
          return;
        }
      }

      if (request.method === "GET") {
        serveStatic(response, url.pathname);
        return;
      }
      sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error("Request failed:", error);
      sendJson(response, 500, { error: "An unexpected server error occurred." });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  const app = createApp();
  app.listen(port, host, () => {
    console.log(`SOC Detective is running at http://localhost:${port}`);
  });
}

export { createApp, createDatabase };
