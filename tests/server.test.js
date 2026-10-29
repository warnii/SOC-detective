import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp, createDatabase } from "../src/server.js";

const database = createDatabase(":memory:");
const server = createApp({ database });
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  database.close();
});

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, body };
}

test("serves the dashboard and seeds the demo queue", async () => {
  const page = await request("/");
  assert.equal(page.response.status, 200);
  assert.match(page.body, /SOC Detective/);

  const cases = await request("/api/cases");
  assert.equal(cases.response.status, 200);
  assert.equal(cases.response.headers.get("cache-control"), "no-store");
  assert.equal(cases.body.length, 6);
  assert.equal(cases.body[0].id, "INC-2408");
});

test("creates cases and records status transitions", async () => {
  const created = await request("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Analyst-reported suspicious login",
      severity: "Medium",
      description: "Reported for follow-up.",
      analyst: "Morgan Lee",
    }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.status, "Open");
  assert.equal(created.body.history.length, 1);
  assert.equal(created.body.history[0].analyst, "Morgan Lee");
  assert.equal(Number.isNaN(Date.parse(created.body.createdAt)), false);
  const caseId = created.body.id;

  const investigating = await request(`/api/cases/${caseId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Investigating", analyst: "Morgan Lee" }),
  });
  assert.equal(investigating.response.status, 200);
  assert.equal(investigating.body.status, "Investigating");
  assert.equal(investigating.body.history.length, 2);
  assert.equal(investigating.body.history[0].analyst, "Morgan Lee");

  const resolved = await request(`/api/cases/${caseId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Resolved" }),
  });
  assert.equal(resolved.response.status, 200);
  assert.equal(resolved.body.status, "Resolved");
  assert.deepEqual(
    resolved.body.history.slice(0, 2).map((entry) => [entry.fromStatus, entry.toStatus]),
    [["Investigating", "Resolved"], ["Open", "Investigating"]],
  );
});

test("stores investigation notes and rejects invalid input and transitions", async () => {
  const note = await request("/api/cases/INC-2408/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "Confirmed with the account owner.", analyst: "Morgan Lee" }),
  });
  assert.equal(note.response.status, 201);
  assert.equal(note.body.notes[0].content, "Confirmed with the account owner.");
  assert.equal(note.body.notes[0].analyst, "Morgan Lee");

  const badSeverity = await request("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Bad input", severity: "Urgent" }),
  });
  assert.equal(badSeverity.response.status, 400);

  const invalidTransition = await request("/api/cases/INC-2408/status", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Resolved" }),
  });
  assert.equal(invalidTransition.response.status, 409);

  const missingCase = await request("/api/cases/not-a-case");
  assert.equal(missingCase.response.status, 404);
});

test("edits case details and stores evidence references", async () => {
  const updated = await request("/api/cases/INC-2408", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Failed sign-ins confirmed", severity: "Medium" }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.title, "Failed sign-ins confirmed");
  assert.equal(updated.body.severity, "Medium");

  const evidence = await request("/api/cases/INC-2408/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "Identity provider sign-in log",
      details: "Reviewed the authentication events for the affected account.",
    }),
  });
  assert.equal(evidence.response.status, 201);
  assert.equal(evidence.body.evidence[0].label, "Identity provider sign-in log");

  const invalidEdit = await request("/api/cases/INC-2408", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ severity: "Urgent" }),
  });
  assert.equal(invalidEdit.response.status, 400);
});
