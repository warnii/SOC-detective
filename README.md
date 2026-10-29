# SOC Detective

SOC Detective is a local, portfolio-ready case-management training app. It demonstrates a fictional analyst workflow: triage a queue, create a case, record investigation notes, and move a case through an audited status lifecycle.

## Requirements

- Node.js 22.5 or later (uses Node's built-in SQLite module)
- No third-party npm dependencies

## Run locally

```powershell
npm.cmd start
```

Open [http://localhost:3000](http://localhost:3000). Set `PORT` to use another port or `SOC_DB_PATH` to choose a different SQLite file. The app binds to `127.0.0.1` by default so it is only available on the local machine.

## Test

```powershell
npm.cmd test
```

The tests use an in-memory SQLite database and do not alter the local app database.

## Analyst workflow

- Search and filter cases by severity and status.
- Review a live severity breakdown and an unresolved critical/high priority watchlist.
- Review and edit case summaries, observables, evidence references, analyst notes, and status history.
- Set a browser-local analyst display name; notes, evidence, and status changes record that label.
- Create cases with a severity, source, summary, account, asset, and indicator.
- Add investigation notes.
- Record text-based evidence references with an analyst and timestamp.
- Advance cases through `Open → Investigating → Resolved`. Each status change records the analyst and timestamp.

See [PROJECT-UNDERSTANDING.md](./PROJECT-UNDERSTANDING.md) for a first-person overview of the SOC workflow this project demonstrates and its limitations.

The API validates inputs, uses parameterized SQL statements, and keeps case, note, and history updates in SQLite transactions where they need to stay consistent.

## Data and safety

On first run, the app seeds fictional training cases into `data/soc-detective.sqlite`. Local case changes persist across restarts. The SQLite database is ignored by Git; do not commit real incident data.

This project is a learning/demo app, not a production SIEM or incident-response platform. The analyst name is a display label, not authentication or proof of identity. The app has no authentication, authorization, multi-user access controls, or integrations. Evidence is stored as text references only; file upload and evidence integrity verification are not implemented. Do not enter real alerts, personal data, credentials, or sensitive indicators. It does not execute containment or remediation actions.

## Project layout

```text
public/       Browser UI
src/          Node.js HTTP API and SQLite data layer
tests/        API and workflow tests
data/         Local SQLite database (generated, not committed)
```

## Publishing to GitHub

After reviewing the files and confirming no sensitive data is present:

1. Create an empty repository on GitHub.
2. In this folder, initialize Git and make an initial commit:

   ```powershell
   git init
   git add .
   git commit -m "Initial SOC Detective case-management app"
   ```

3. Add your repository URL and push the branch:

   ```powershell
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/YOUR-REPOSITORY.git
   git push -u origin main
   ```

The `.gitignore` excludes the local database, so cases you create will remain local.
