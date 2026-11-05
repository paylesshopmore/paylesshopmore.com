# PayLesShopMore — Software Developer Handbook

The official technical handbook for the PayLesShopMore web application
(`paylesshopmore/paylesshopmore.com`). It is written so that a developer who
has never met the original author can understand, run, maintain, troubleshoot,
secure and extend the whole system.

> **Status:** Volume 1 written (2026-11-05). Volumes 2–10 planned below and
> written one at a time. Each volume states the commit date of the code it was
> checked against.

---

## How to use this handbook

| If you want to… | Start with |
|---|---|
| Understand the system in one sitting | [Volume 1 — Overview & Architecture](vol-01-architecture.md) |
| Find which page or file does something | Vol 1 §4 (folders), then [`docs/WEBSITE-MAP.md`](../WEBSITE-MAP.md) |
| Fix something that is broken **right now** | Volume 10 — Runbooks *(planned)*, then Volume 9 — Troubleshooting *(planned)* |
| Add a feature | Volume 10 — Maintenance workflows *(planned)* |

### Conventions used in every volume

| Marker | Meaning |
|---|---|
| `path/to/file.py` | A real file, relative to the repository root unless the section says otherwise. |
| **[VERIFIED]** | Checked against the source file named next to it. |
| **[UNVERIFIED]** | Cannot be confirmed from the repository (e.g. a setting that lives only in the DigitalOcean dashboard). Confirm before relying on it. |
| **[NOT IMPLEMENTED]** | The master documentation brief asks about it, but the project does not use it. Explained instead of invented. |
| 🟢 SAFE | A command that only reads. Run it freely while diagnosing. |
| 🟠 CHANGES STATE | A command that writes, restarts or migrates. Read the explanation first. |
| 🔴 DESTRUCTIVE | Deletes or overwrites data. Only after a verified backup (Vol 10). |
| → Vol N §x | Cross-reference to another volume/section. |

Secrets are **never** reproduced in this handbook. Where a file contains one
(`backend/.env`, `.do/local/*`), the handbook names the *variable*, never the
value.

---

## Volume plan

Page estimates assume ~450 words per printed page. Every general concept
(React hooks, Django QuerySets, …) is taught through this project's own code
rather than as a stand-alone tutorial.

| Vol | File | Title | Est. pages | Status |
|---|---|---|---|---|
| 1 | [vol-01-architecture.md](vol-01-architecture.md) | Project Overview & Architecture | 50 | ✅ Written |
| 2 | `vol-02-react.md` | React.js (React 19, Vite, Router 7, contexts, i18n, OCR/camera) | 170 | Planned |
| 3 | `vol-03-django.md` | Django & Python (15 apps, middleware, Celery, settings) | 160 | Planned |
| 4 | `vol-04-database.md` | Database & Data Management (~63 models, migrations, ER) | 100 | Planned |
| 5 | `vol-05-api.md` | API & System Integration (every endpoint, integrations v1, webhooks) | 120 | Planned |
| 6 | `vol-06-security.md` | Authentication & Cybersecurity | 80 | Planned |
| 7 | `vol-07-testing.md` | Testing & Quality Assurance | 50 | Planned |
| 8 | `vol-08-deployment.md` | Deployment & Server Administration (DigitalOcean) | 70 | Planned |
| 9 | `vol-09-troubleshooting.md` | Troubleshooting & Error Recovery | 130 | Planned |
| 10 | `vol-10-maintenance-dr-runbooks.md` | Maintenance, Disaster Recovery, Runbooks, Command reference, Index | 90 | Planned |

A cumulative **glossary** starts in Vol 1 §17 and is extended by each volume;
the final **index** is in Vol 10.

---

## Existing project documents (kept, not duplicated)

The handbook links to these rather than copying them. When one changes,
update the handbook section that cites it.

| Document | Covers | Cited in |
|---|---|---|
| [`docs/WEBSITE-MAP.md`](../WEBSITE-MAP.md) | Every page, its file, its backend | Vol 1, 2 |
| [`DEPLOYMENT.md`](../../DEPLOYMENT.md) | Deploying, sign-in codes, floor devices, CI, schedules | Vol 8 |
| [`DIGITALOCEAN_DEPLOYMENT.md`](../../DIGITALOCEAN_DEPLOYMENT.md) | App Platform first deploy, domain | Vol 8 |
| [`docs/BACKUPS.md`](../BACKUPS.md) | Backups, error monitoring | Vol 10 |
| [`docs/TWO-FACTOR.md`](../TWO-FACTOR.md) | Two-factor sign-in | Vol 6 |
| [`docs/TRACKING.md`](../TRACKING.md), [`docs/CARRIER_INTEGRATIONS.md`](../CARRIER_INTEGRATIONS.md) | Courier tracking | Vol 5 |
| [`docs/INTEGRATIONS.md`](../INTEGRATIONS.md) | API keys and webhooks | Vol 5 |
| [`docs/PREALERTS.md`](../PREALERTS.md) | Pre-alerts | Vol 5 |
| [`docs/DOCUMENT_REVIEW.md`](../DOCUMENT_REVIEW.md) | AI document reading | Vol 3, 5 |
| [`docs/measurement-station.md`](../measurement-station.md), [`docs/camera-frame.md`](../camera-frame.md) | Camera measurement | Vol 2 |
| [`docs/TRANSLATION_REVIEW.md`](../TRANSLATION_REVIEW.md) | nl / en / pap texts | Vol 2 |

---

## Keeping it current

The handbook is versioned with the code on purpose. Rule of thumb for code
review: **a pull request that changes behaviour described here changes the
handbook in the same PR.** Each volume ends with a "Source files this volume
depends on" list — if you touch one of those files, re-read that section.
