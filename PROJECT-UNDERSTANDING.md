# My Understanding of SOC Detective

## What this project is

SOC Detective is a small Security Operations Center (SOC) case-management training application. It gives me a place to practice how an analyst reviews security alerts, organizes an investigation, records what they learn, and tracks a case to resolution.

The alerts and indicators in the application are fictional examples. The app is a learning project, not a live monitoring or incident-response system.

## What I understand about the SOC workflow

1. **Triage:** Review incoming alerts and prioritize them by severity and current status. A critical or high severity deserves attention, but severity alone does not prove that an incident is malicious.
2. **Investigate:** Review the alert summary and observables, such as the account, asset, or indicator. Check the available evidence and document findings rather than making assumptions from a single alert.
3. **Record:** Add clear analyst notes and evidence references so another analyst can understand what was checked, what was found, and what still needs follow-up.
4. **Track:** Move a case through `Open → Investigating → Resolved` as work progresses. Status describes workflow progress; severity describes the assessed priority. They are related, but they are not the same thing.
5. **Review:** Use the queue, metrics, severity breakdown, and priority watchlist to understand the current workload and identify unresolved critical or high cases.

## What I can do in the application

- View, search, and filter fictional cases.
- Create a case and edit its summary, severity, source, account, asset, or indicator.
- Review a case's observables, evidence references, notes, and status history.
- Add investigation notes and text-based evidence references.
- Change a case's status and see the transition recorded with a timestamp and analyst display name.
- See a severity breakdown and a priority watchlist for unresolved critical and high cases.

## How it is built

- **Browser interface:** HTML, CSS, and JavaScript in `public/`.
- **Application API:** Node.js HTTP server in `src/`.
- **Persistent data:** SQLite stores cases, notes, evidence references, and status history.
- **Tests:** Node's built-in test runner checks the API and core case workflows.
- **Dependencies:** Node.js 22.5 or later; the project does not require third-party npm packages.

I can run the app with `npm.cmd start` and run its tests with `npm.cmd test`.

## Important limitations

- The sample cases are for practice; the app does not ingest or analyze real security telemetry.
- An analyst display name is only a label. There is no login, identity verification, or access control.
- Evidence entries are text references. The app does not upload files, preserve forensic images, or verify evidence integrity.
- There are no SIEM, endpoint, identity, email, or threat-intelligence integrations.
- The app does not isolate devices, disable accounts, block indicators, or perform any other containment action.
- It is not designed or secured for production use. I should not enter real alerts, personal information, credentials, or sensitive indicators.

## What I would improve next

To move beyond a local training app, I would first define the requirements and threat model, then add authenticated users and role-based access, stronger audit controls, and a reviewed deployment design. I would only integrate approved data sources and response actions after adding appropriate authorization, validation, testing, and safeguards. Any imported or generated cases should remain clearly identified as sample data unless their source is verified.
