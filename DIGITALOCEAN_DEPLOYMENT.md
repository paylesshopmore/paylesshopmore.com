# Deploying to DigitalOcean App Platform

The whole site is described in `.do/app.yaml`: one App with two separate
components.

| Component | Built from | Answers | What it is |
| --- | --- | --- | --- |
| `frontend` (Static Site) | `frontend/` | everything else | The React build, served from DigitalOcean's CDN |
| `api` (Web Service) | `backend/Dockerfile` | `/api`, `/admin`, `/static` | Django under gunicorn |

They build and deploy independently: a push that only touches `frontend/`
rebuilds only the site, and the other way round. They still share one domain,
which keeps the session cookie first-party (see `DEPLOYMENT.md` for why that
matters).

## First deploy

1. **A database.** Create a DigitalOcean Managed PostgreSQL cluster in
   Amsterdam (`ams3`), or use one you already have (Neon, ...). Copy its
   connection string. Under the cluster's *Trusted Sources*, add the App once
   it exists.
2. **A Space for uploads** (optional at first, needed before real customers).
   Create a Space in `ams3` and an access key for it. Without one, uploaded
   files live on the container's disk and are lost at every deploy.
3. **Create the App.** Apps > Create App > *Import an App Spec*, paste
   `.do/app.yaml`. If you already have an App (the one that failed with "no
   default process"), open it and go to Settings > App Spec > Edit, then
   replace its contents instead.
4. **Add the secrets** on the `api` component (Settings > Environment
   Variables, tick *Encrypt*):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The connection string from step 1 |
   | `DJANGO_SECRET_KEY` | `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
   | `DJANGO_TWO_FACTOR_ENCRYPTION_KEYS` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Never lose it. |
   | `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DJANGO_FROM_EMAIL` | Your mail provider |
   | `DJANGO_BOOKING_NOTIFY_EMAILS` | Optional. Who is e-mailed about each new booking, comma-separated. Default: `DJANGO_REPLY_TO_EMAIL` (info@paylesshopmore.com) |
   | `AWS_STORAGE_BUCKET_NAME` | The Space's name |
   | `AWS_S3_ENDPOINT_URL` | `https://ams3.digitaloceanspaces.com` |
   | `AWS_S3_REGION_NAME` | `ams3` |
   | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | The Space's access key |

   Plus `OPENAI_API_KEY`, `SEVENTEEN_TRACK_API_KEY` and `SENTRY_DSN` if you use
   them. `backend/.env.example` describes every variable.
5. **Deploy**, then open `https://<your-app>.ondigitalocean.app/api/health/`.
   It should say `{"status": "ok"}`. `/api/ready/` also checks the database.
6. **Create the first admin** from the `api` component's *Console* tab:
   `python manage.py createsuperuser`.

## A custom domain

Settings > Domains > Add Domain. `DJANGO_ALLOWED_HOSTS` and
`DJANGO_FRONTEND_URL` are set from `${APP_DOMAIN}` and `${APP_URL}`, so they
follow the domain on their own. Once the site works there, raise
`DJANGO_HSTS_SECONDS` to `31536000` in the spec.

## Good to know

- **The visitor's address.** The API can only be reached through the App's
  own router, which puts the visitor's real address in `Do-Connecting-Ip`.
  The rate limits read it from there (`config/client_ip.py`).
- **Security headers on the site.** A DigitalOcean static site cannot add
  custom headers, so `X-Frame-Options` and friends are only on `/api` and
  `/admin`, where Django sends them.
- **Worker and scheduled jobs** are in `.do/app.yaml`, commented out. Switch them on
  when you need them; each needs the same secrets as `api`.

## When a deploy fails

| Log says | Cause |
| --- | --- |
| `when there is no default process a command is required` | The component is built from the repository root. Its source directory must be `backend`, built with the Dockerfile. |
| `Migrations failed -- the web process will not start` | `DATABASE_URL` is missing or wrong, or the App is not in the database's Trusted Sources. |
| `DJANGO_SECRET_KEY must be set` | The secret is missing on the `api` component. |
| Every page is `400 Bad Request` | `DJANGO_ALLOWED_HOSTS` does not include the address you opened. |
| The site loads but every API call is `404` | A route is missing `preserve_path_prefix: true`. |
