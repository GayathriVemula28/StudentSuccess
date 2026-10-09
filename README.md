# AI-Powered Student Analytics Success Platform

StudentPulse is a React + Vite student success and analytics demo with academic risk insights, success scores, and Student, Faculty, and Admin dashboards.

## Features

- Firebase email/password signup and login, password reset, and Google account sign-in.
- Student account creation with validation and Terms and Conditions acceptance.
- Protected dashboard routes; Firebase role claims control privileged Faculty/Admin routing.
- Secure, owner-scoped Firebase profile documents (no passwords stored in Firestore).
- Clearly labelled sample student analytics until an institution data API is connected.
- Local demo dashboards for Student, Faculty, and Admin.
- Existing FastAPI/SQLite demo backend for legacy registration, CSV preview uploads, and analytics.

## Frontend setup

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
# Edit .env.local with your Firebase web-app values
npm run dev
```

The project builds with `npm run build`.

## Configure Firebase Authentication

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
2. Open **Authentication → Sign-in method** and enable **Email/Password** and **Google**. Set the Google support email.
3. Open **Project settings → General → Your apps**, register a Web app, and copy its Firebase web configuration.
4. Copy `frontend/.env.example` to `frontend/.env.local` and fill in the `VITE_FIREBASE_*` values. Restart Vite after editing the file.
5. Create a Firestore database and deploy the owner-restricted rules in `frontend/firestore.rules`. Do not use test-mode/open rules.
6. Under **Authentication → Settings → Authorized domains**, add `localhost` and your deployed hostname.

Firebase web config values identify the public web client; they are not Admin SDK secrets. Never place a Firebase service-account JSON, Admin SDK private key, or other server secret in frontend code or a `VITE_` variable. Keep `.env.local` private.

The Google button uses Firebase's official `GoogleAuthProvider` popup. Google credentials are entered only on Google's sign-in surface, never into this app. If Firebase settings are absent, the UI explains that real auth must be configured and demo previews remain available.

### Staff role security

Student accounts default to the `student` role. The app reads Faculty/Admin roles from Firebase **custom claims** set by a trusted server or Cloud Function. Do not grant roles from client-side form data or user-editable profile fields. Client-side protected routes are for navigation only; production APIs must verify Firebase ID tokens and authorize roles server-side.

### Profile and demo data

Firebase Auth stores login credentials. Firestore `studentProfiles/{uid}` stores the student's minimum profile details (name, email, optional academic profile fields, photo URL, and timestamps), protected so a user can access only their own profile. The current analytics dashboard still renders sample/demo academic metrics; it does not yet query institution records.

## Optional FastAPI backend

For legacy registration, analytics routes, and CSV upload preview:

```powershell
cd backend
C:\Users\Rajiya\AppData\Local\Programs\Python\Python312\python.exe -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Deploy on Render

The root `render.yaml` defines the Vite frontend as a Render static site and FastAPI as a web service. In Render, choose **New → Blueprint**, connect `GayathriVemula28/StudentSuccess`, and deploy the Blueprint from `main`. Render prompts for `VITE_API_URL` and the Firebase web-app configuration during initial setup. Set `VITE_API_URL` to the deployed API origin (for example, `https://student-success-api.onrender.com`) and add the frontend's Render hostname to Firebase Authentication's authorized domains.

The frontend build command is `npm ci && npm run build` with `frontend` as its root and `frontend/dist` as its publish directory. The backend installs `backend/requirements.txt` and starts with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Render generates `JWT_SECRET_KEY`; do not commit secrets. The free backend uses the existing SQLite database on Render's ephemeral filesystem, so registrations and database changes are not durable across restarts or redeploys. Use managed Postgres or a persistent paid disk before relying on stored user data.

## AI Student Assistant

The Student dashboard includes personalized suggestions and a chat assistant. The authenticated `POST /assistant/chat` endpoint uses the legacy backend JWT and resolves the student record from that token; it does not accept a student ID or retrieve another student's records. It sends only available aggregate academic, attendance, subject-mark, quiz, and assignment-score data to the configured provider.

To enable OpenAI responses, copy the root `.env.example` to `.env` and set `OPENAI_API_KEY`. `OPENAI_MODEL` is optional and defaults to `gpt-4o-mini`. The backend loads this root `.env` automatically. Without a key, the endpoint uses a local data-based response instead; no key is needed to run the app.

Run the backend and frontend using the setup commands above, sign in with a seeded demo account, then open the Student dashboard and select **Ask AI**. When the backend login succeeds, chat uses the authenticated endpoint. Local demo sessions use data-grounded browser responses. Firebase accounts currently have no connected academic records or backend-verifiable token, so the assistant correctly shows an unavailable-data state for them.

The current portal has no assignment titles or due dates and no subject-specific attendance records. Some demo profiles include only a pending-assignment count; the assistant will not rank assignments without deadlines. Attendance recovery estimates are shown only when the available class counts agree with the recorded percentage.

## Local demo dashboard accounts

These are separate from Firebase accounts and are for local demo preview only:

- Student seed account: `ananya@pulse.edu` / `PulseStu-1001!`.
- Generated student account `student####@pulse.edu`: password `PulseStu-####!` (e.g. `student1011@pulse.edu` / `PulseStu-1011!`).
- Faculty: `nair@pulse.edu` / `Faculty-Nair!26`; `sethi@pulse.edu` / `Faculty-Sethi!26`.
- Admin: `admin@pulse.edu` / `Admin-Pulse!26`.

## Notes

- The success score and risk engine are deterministic and explainable.
- The demo app works without an external AI API.
- For production, connect authenticated student profiles to verified institution data and replace all demo-only dashboard and CSV flows.
