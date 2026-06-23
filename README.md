# Ledger — personal expense tracker

Single-user (shared-password) personal expense tracker. Tracks daily spend,
category budgets, recurring expenses, and month-over-month trends.

## Stack

- **Backend:** .NET 8 + MongoDB (MongoDB Atlas for production)
- **Frontend:** React 18 + Vite
- **Auth:** JWT with one shared password (BCrypt-hashed in MongoDB)

## Local setup

### 1. Server

```bash
cd server
cp .env.example .env        # then edit values
dotnet run                  # listens on http://localhost:5198
```

`server/.env`:
```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=expenses_dev
ALLOWED_ORIGIN=http://localhost:5173
ADMIN_PASSWORD=local-dev-password
AUTH_JWT_SECRET=dev-secret-change-me-in-prod-please
```

### 2. Client

```bash
cd client
npm install
npm run dev                  # listens on http://localhost:5173
```

Vite proxies `/api/*` to the .NET backend (see `client/vite.config.js`).

### 3. Sign in

The first screen on the client asks for a password. Use the value of
`ADMIN_PASSWORD` in your `server/.env`. Change it after first login via
the "Change password" link on the Login page.

## Deploy

- **Backend** → Render. `server/render.yaml` defines the service.
- **Frontend** → Vercel. Build command: `npm run build`, output: `client/dist`.
- **Database** → MongoDB Atlas free tier (M0).
- **Secrets** to set in Render's dashboard: `MONGODB_URI`, `MONGODB_DB`,
  `ALLOWED_ORIGIN` (your Vercel URL), `ADMIN_PASSWORD`, `AUTH_JWT_SECRET`.
- **Secret** to set in Vercel: `VITE_API_URL` (your Render service URL).

After first deploy, log in once and use "Change password" to set a strong
password that's not in this repo.

## Project layout

```
client/                      React + Vite
  src/
    pages/                   AddExpense, History, AdminCategories, Login
    components/              CategoryPicker
    api.js                   fetch wrapper, attaches JWT
    styles.css               design system (tokens, layout, components)
    App.jsx                  routes, auth gate
  vite.config.js

server/                      .NET 8 Web API
  Auth/                      JwtAuthMiddleware
  Controllers/               Auth, Expenses, Categories, Budgets, Recurring
  Models/                    Expense, Category, Budget, Recurring, User
  Services/                  Repos + TokenService + RecurringPostingService
  Program.cs                 startup, DI, seeding
  render.yaml                Render service config
```
