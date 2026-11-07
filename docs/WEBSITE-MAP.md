# Website map: how the pieces fit together

Start here if you are new to this codebase. This page explains, in plain
words, how the website is built, which address opens which file, and which
pages are connected to each other.

Every page file also has a short **CONNECTED PAGES** comment at the top
with its own part of this map, so you can see the connections without
leaving the file you are working in.

---

## 1. The big picture

The website is two programs that talk to each other:

```
 Browser (the visitor)
    │
    │  opens https://paylesshopmore.com/booking
    ▼
 FRONTEND  - React, in frontend/          (DigitalOcean static site)
    │  draws the pages; asks the backend for data
    │
    │  fetch("/api/bookings/")   ← always a relative /api/... address
    ▼
 BACKEND   - Django, in backend/          (DigitalOcean service)
    │  checks who you are, reads and writes the database, sends e-mail
    ▼
 DATABASE  - PostgreSQL in production, SQLite (backend/db.sqlite3) on your PC
```

- **The frontend** (`frontend/src/`) is a React app built with Vite. It
  decides *what the screen looks like*.
- **The backend** (`backend/`) is a Django + Django REST Framework app. It
  decides *what is allowed* and *what is stored*.
- **They meet at `/api/...`.** In development the Vite dev server
  (`localhost:5173`) forwards `/api`, `/admin` and `/static` to Django on
  `localhost:8000` (`frontend/vite.config.js`). In production DigitalOcean
  does the same (`.do/app.yaml`, "routes"). The browser therefore only ever sees
  one address, which keeps the login cookie working.

### Running it on your own PC

```
# backend, in backend/
.venv\Scripts\python.exe manage.py migrate      # after pulling new code
.venv\Scripts\python.exe manage.py runserver    # http://localhost:8000

# frontend, in frontend/
npm install
npm run dev                                     # http://localhost:5173
```

---

## 2. Where things live (frontend)

| Folder | What is in it |
|---|---|
| `src/App.jsx` | **The route table**: which address opens which page, and who may open it. Read this first. |
| `src/pages/<Name>/` | One folder per page (or per area: `Dashboard/`, `Warehouse/`). |
| `src/components/` | Pieces used on several pages: `Header`, `Footer`, `QuoteForm`, `TrackingPanel`, the `Tutorial` tours, ... |
| `src/api/` | **Every call to the backend.** One file per backend area, e.g. `api/booking.js`. Pages never call `fetch` themselves; they import from here. `api/client.js` adds the cookie and the CSRF header. |
| `src/i18n/` | All texts in Dutch (nl), English (en) and Papiamentu (pap). A page asks for `t('booking.title')` instead of writing the text itself. |
| `src/auth/` | Who is signed in (`useAuth()`). |
| `src/calculator/` | The shipping calculator's prices (`rates.js`) and maths (`calculate.js`). |
| `src/data/` | Fixed lists: destinations, shops, company details. |
| `*.test.jsx` | Tests, next to the file they test. Run with `npm test`. |

## 3. Where things live (backend)

Each folder in `backend/` is a Django "app" with its own `models.py`
(database tables), `views.py` (what happens on a request), `urls.py` (the
addresses) and `tests.py`.

| App | Answers | Used by (frontend `src/api/` file) |
|---|---|---|
| `accounts` | login, signup, profile, addresses, packages, tracking, home page stats, driver | `auth.js`, `profile.js`, `tracking.js`, `driver.js` |
| `bookings` | the booking form, "my bookings" | `booking.js` |
| `enquiries` | the contact form and quote requests | `contact.js`, `quote.js` |
| `invoicing` | customers' invoices (and the PDFs) | `invoices.js` |
| `notifications` | the bell in the header | `notifications.js` |
| `shops` | the webshop logos | `shops.js` |
| `blog` | blog posts | `blog.js` |
| `staff` | **everything under `/api/staff/`**: the office dashboard | `staff.js` |
| `warehouse` | intake sheets, measuring, packing, damage (also under `/api/staff/`) | `staff.js`, `warehouse.js` |
| `integrations` | other software: API keys in (`/api/integrations/v1/`), webhooks out; managed in the Django admin (the dashboard page was removed). Guide: [INTEGRATIONS.md](INTEGRATIONS.md) | `integrations.js` |
| `config` | settings, the main URL list (`config/urls.py`), health checks | - |

---

## 4. Who may open what

`src/App.jsx` wraps some pages in a **guard**. A guard only changes what the
screen shows; the real protection is the backend, which refuses data to
anyone who is not allowed (401/403), whatever the browser does.

| Area | Guard | Who gets in |
|---|---|---|
| Public website (`/`, `/booking`, `/faq`, ...) | none | everybody |
| `/profile` | `RequireAuth` | anyone signed in |
| `/prealert` | `RequireAuth` | anyone signed in |
| `/dashboard/...` (the office) | `RequireStaff` | office staff (`is_staff`) |
| `/warehouse/...` | `RequireWarehouse` | warehouse workers and office staff |
| `/driver` | `RequireDriver` | drivers and office staff |

---

## 5. Every page

**Address** is what you type in the browser. **File** is in `frontend/src/`.
**Backend** is the `src/api/` file the page uses.

### Public website

These all share the **Header** (top menu: Home, Services, Tutorial,
Destinations, Booking, Calculator, Contact, Log in / Sign up or your account)
and the **Footer** (Home, Services, Track & Trace, Booking, Calculator,
Contact, Blog, FAQ, Privacy, Terms). So every public page is one click away
from the others through those menus.

| Address | File | What it is | Backend |
|---|---|---|---|
| `/` | `pages/Home/Home.jsx` | Home: hero, route map, shops, stats, Track & Trace | `tracking.js` (via `TrackingPanel`, `StatsBand`), `shops.js` |
| `/services` | `pages/Services/Services.jsx` | What the company does | - |
| `/tutorial` | `pages/Tutorial/Tutorial.jsx` | How ordering and shipping work, step by step | - |
| `/destinations` | `pages/Destinations/Destinations.jsx` | All islands | - |
| `/destinations/:slug` | `pages/Destination/Destination.jsx` | One island, e.g. `/destinations/curacao`, with a quote form | `quote.js` (via `QuoteForm`) |
| `/booking` | `pages/Booking/Booking.jsx` | The booking form: tell us a parcel is coming | `booking.js`, `shops.js` |
| `/calculator` | `pages/Calculator/Calculator.jsx` | Shipping cost calculator (prices in `calculator/rates.js`) | `quote.js` (the quote form under it) |
| `/contact` | `components/Contact/Contact.jsx` | Contact details and form | `contact.js` |
| `/faq` | `pages/Faq/Faq.jsx` | Questions and answers | - |
| `/blog`, `/blog/:slug` | `pages/Blog/Blog.jsx`, `BlogPost.jsx` | The blog and one post | `blog.js` |
| `/privacy`, `/terms` | `pages/Privacy/Privacy.jsx`, `pages/Terms/Terms.jsx` | Legal pages | - |
| `/login`, `/signup` | `pages/Login/Login.jsx`, `pages/Signup/Signup.jsx` | Sign in / create an account | `auth.js` |
| `/forgot-password`, `/reset-password/:uid/:token` | `pages/PasswordReset/` | Password reset by e-mail | `auth.js` |
| `/two-factor` | `pages/TwoFactor/TwoFactorPage.jsx` | The authenticator-app code after the password, and its one-time setup, when the admin's policy asks for it ([TWO-FACTOR.md](TWO-FACTOR.md)) | `twoFactor.js` |
| `/tracking` | (redirect) | Goes to `/profile#tracking` | - |
| `/profile` | `pages/Profile/Profile.jsx` | The customer's account: details, shipments, bookings, invoices | `profile.js`, `booking.js`, `invoices.js`, `auth.js` |
| `/prealert` | `pages/PreAlert/PreAlertForm.jsx` | Pre-alert a package on its way to our warehouse ([PREALERTS.md](PREALERTS.md)) | `prealerts.js`, `tracking.js`, `shops.js`, `profile.js` |
| anything else | `pages/NotFound/NotFound.jsx` | "Page not found" | - |

### Office dashboard (`/dashboard`)

Shell: `pages/Dashboard/DashboardLayout.jsx` - the sidebar that links to
every page below, plus "Django admin", "Back to the site" and the warehouse.
All pages use `api/staff.js` unless noted.

| Address | File | What it is |
|---|---|---|
| `/dashboard` | `Overview.jsx` | The numbers, with links into the other pages and the warehouse |
| `/dashboard/quotes` | `Quotes.jsx` | Quote requests from the website |
| `/dashboard/messages` | `Messages.jsx` | Contact form messages; answer them from here (e-mailed to the sender, `enquiries/replies.py`) |
| `/dashboard/document-review` | `DocumentReview.jsx`, `DocumentJobPanel.jsx` | Documents read by AI and matched to records; the review queue for uncertain ones. See [DOCUMENT_REVIEW.md](DOCUMENT_REVIEW.md) |
| `/dashboard/reports` | `Reports.jsx` | Monthly report: one month vs. the month before, 12-month chart, print / CSV (`staff/reports.py`) |
| `/dashboard/packages` | `Packages.jsx` | All shipments; links to a package's warehouse page and its label |
| `/dashboard/bookings` | `Bookings.jsx` | Booking forms; links to the customer and the package |
| `/dashboard/invoices` | `Invoices.jsx` + `InvoiceDetail.jsx` | Invoices, with the PDF shown in place |
| `/dashboard/documents` | `Documents.jsx` | Uploaded documents |
| `/dashboard/measurements` | `MeasurementsList.jsx` | Measurements from intake sheets; opens the sheet |
| `/dashboard/customers`, `/workers` | `Customers.jsx`, `Workers.jsx` | Accounts (they link to each other) |
| `/dashboard/warehouse-access` | `WarehouseAccess.jsx` | Which warehouse parts each worker may use (`api/warehouse.js`) |
| `/dashboard/floor-devices` | `FloorDevices.jsx` | Shared tablets on the warehouse floor |
| `/dashboard/shops` | `Shops.jsx` | The shop logos on the home page (`api/shops.js`) |
| `/dashboard/prealerts` | `PreAlerts.jsx` | Parcels customers pre-alerted: details, invoice, add to a shipment (`api/staff.js`, backend `prealerts/`). Office; warehouse manager reads. See [PREALERTS.md](PREALERTS.md) |
| `/dashboard/courier-tracking` | `CourierTracking.jsx` | Every courier number we follow: incoming (webshop orders on their way to our warehouse) and outgoing (our shipments on their way to the island). Register and correct numbers (office). `api/staff.js`, backend `tracking/`. Office and warehouse manager. See [TRACKING.md](TRACKING.md) |
| `/dashboard/blog` | `Blog.jsx` | Write blog posts; links to the post on the website (`api/blog.js`) |
| `/dashboard/website` | `WebsiteSettings.jsx` | Admins: switch the public Calculator page on or off (`api/staff.js`, backend `staff/site_settings.py`) |
| `/dashboard/security` | `Security.jsx` | Admins: two-factor sign-in off / optional / required, and its history (`api/twoFactor.js`) |
| `/dashboard/system` | `SystemStatus.jsx` | Admins: recent database backups, error monitoring (Sentry), e-mail. See [BACKUPS.md](BACKUPS.md) |

### Warehouse (`/warehouse`)

Shell: `pages/Warehouse/WarehouseLayout.jsx` - menu (Home, Scan, Intake
sheets, Profile) and the "Guide" button for the warehouse tour.

| Address | File | What it is | Backend |
|---|---|---|---|
| `/warehouse/login` | `Warehouse/WarehouseLogin.jsx` | The warehouse's own sign-in: e-mail + PIN, or "tap your name" on a registered device. Office staff are linked on to `/login` | `auth.js` |
| `/warehouse` | `Warehouse/WarehouseHome.jsx` | Scan button, New intake sheet, the packages in the warehouse | `staff.js` |
| `/warehouse/scan` | `Dashboard/Scan.jsx` | Camera scanner; opens the package or its intake sheet | `staff.js`, `warehouse.js` |
| `/warehouse/packages/:id` | `Warehouse/PackagePage.jsx` | One package: verify, measure, pack, damage, photos, history | `staff.js`, `warehouse.js` |
| `/warehouse/shipments/:id/label` | `Warehouse/ShipmentLabel.jsx` | The printable sticker (barcode + QR) | `staff.js` |
| `/warehouse/intake` | `Dashboard/Intake.jsx` | Intake sheets: the form, label scanner, damage photos | `staff.js`, `profile.js` |
| `/warehouse/profile` | `Warehouse/WarehouseProfile.jsx` | The worker's own page | `staff.js`, `profile.js` |
| `/warehouse/pin` | `Warehouse/SetPinPage.jsx` | Choose a floor PIN after an e-mailed code, or (required) after signing in with a PIN a manager generated | `profile.js` |
| `/warehouse/unassigned` | `Warehouse/UnassignedQueue.jsx` | "Without a customer": intake sheets nobody has tied to a customer, shipment or booking yet, oldest first | `staff.js` (`listIntakeSheets({ unassigned })`) |
| `/warehouse/assign/:sheetId` | `Warehouse/AssignCustomer.jsx` | Find the customer (number, e-mail, tracking/booking/consignment number, name), check, confirm. Existing customers only; changing one that is set: managers, with a reason | `staff.js` (`lookupCustomers`, `assignIntakeCustomer`) |
| `/warehouse/manager` | `Warehouse/ManagerOverview.jsx` (in `ManagerLayout.jsx`) | Warehouse management, admins and warehouse managers only: live numbers, who is signed in, today per worker, packages that need attention | `warehouse.js` (`getManagerStats`) |
| `/warehouse/manager/packages` | `Warehouse/ManagerReview.jsx` | Package review: every released intake sheet with its quality checks; approve, or send back to the floor with a note (reopens the sheet) | `warehouse.js` (`getReviewQueue`), `staff.js` (`reviewIntakeSheet`) |
| `/warehouse/manager/intakes` | `Warehouse/ManagerIntakes.jsx` | Every intake with its intake number (001, 002 ...): filter by state, worker, customer, number, date; delete EMPTY intakes (the number is then reused), archive the rest. Backend `warehouse/intake_numbers.py` | `staff.js` (`listIntakeSheets`, `deleteIntakeSheet`, `archiveIntakeSheet`) |
| `/warehouse/manager/workers` | `Dashboard/Workers.jsx` | The Workers page, inside warehouse management: add workers, generate PINs, switch accounts off/on | `staff.js` |
| `/warehouse/manager/activity` | `Warehouse/ManagerActivity.jsx` | The whole warehouse's activity log (sign-ins, PINs, every package action), filterable by worker, action, tracking number and date | `warehouse.js` (`getManagerActivity`) |
| `/warehouse/packages`, `/measurements`, `/packaging`, `/damage`, `/activity` | (redirect) | Old addresses; go to `/warehouse` | - |

### Driver (`/driver`)

| Address | File | What it is | Backend |
|---|---|---|---|
| `/driver` | `pages/Driver/DriverPage.jsx` | Deliveries to make, proof of delivery | `driver.js` |

---

## 6. How the pages connect (the important routes through the site)

These are the paths people actually take. Each arrow is a link or a
redirect in the code.

**A new customer**
```
Home ─► Tutorial ─► Sign up ─► Profile
  │                    ▲
  └─► Log in ──────────┘   (Log in also leads to Forgot password)
```

**Sending a parcel**
```
Home / Destinations / Calculator ─► (quote form on the page)
Header "Booking" ─► Booking ─► Profile ("My bookings")
```

**Tracking a parcel**
```
Home (Track & Trace panel)          /tracking ─► Profile #tracking
```

**The warehouse floor**
```
Warehouse home ─► Scan ─► Package page ─► Label (print)
      │             └───► Intake sheet (a booking code)
      └─► New intake sheet ─► Intake sheet
```

**The office**
```
Dashboard overview ─► Packages ─► Package page (in the warehouse) ─► Label
                   ─► Bookings ─► Customers
                   ─► Invoices ─► Customers / Packages
Dashboard sidebar ─► Warehouse, "Back to the site", Django admin (/admin/)
```

**Signing in sends you to your own area** (`homeFor()` in `pages/Login/Login.jsx`)
```
Log in ─► customer: Profile
       ─► office staff: Warehouse profile (/warehouse/profile)
       ─► warehouse worker, with a code or PIN: Warehouse
       ─► warehouse worker, with a password: Profile (with a button to the warehouse)
       ─► a new floor worker after an e-mailed code: first /warehouse/pin
       ─► driver: Driver
Coming from a page that needed a login? You go back to that page instead.
```

---

## 7. Changing things: where to look

| I want to... | Edit |
|---|---|
| add a page | create `src/pages/MyPage/MyPage.jsx`, add a `lazy(() => import(...))` and a `<Route>` in `src/App.jsx`, link to it from the Header/Footer or another page, and add this page to the tables above |
| change a text | `src/i18n/translations.js` (website), `dashboardTranslations.js` (dashboard + warehouse), `warehouseFlowTranslations.js` (warehouse workflow). Change it in **nl, en and pap**. |
| add a backend call | a function in the right `src/api/*.js`, and a view + URL in the backend app |
| change a database table | `backend/<app>/models.py`, then `manage.py makemigrations` and `manage.py migrate` |
| change shipping prices | `src/calculator/rates.js` |
| change the warehouse tour | `src/components/Tutorial/tutorialSteps.js` (steps) and `translations.js` (texts) |

## 8. Known loose ends

- The Footer links to `/about-us` and `/cookies`, but there are no such
  pages yet: both show "Page not found".
