# Development Guide

This document tracks ongoing development work, future improvements, and important implementation details.

## Project Overview

Ledger is a personal expense tracker with:
- React frontend (Vite)
- .NET 8 backend with MongoDB
- JWT authentication with shared password
- Responsive design for mobile/desktop

## Current Architecture

### Frontend (client/)
- React 18 with React Router
- Vite for build tooling
- Component structure:
  - AddExpense: Main entry point for new expenses
  - History: View and filter past expenses
  - AdminCategories: Manage categories and budgets
  - Login: Authentication page
- API client in `api.js` with JWT handling
- Custom CSS design system in `styles.css`

### Backend (server/)
- .NET 8 Web API
- MongoDB for data storage
- Controllers:
  - AuthController: JWT authentication
  - ExpensesController: CRUD operations for expenses
  - CategoriesController: Category management
  - BudgetsController: Budget tracking
  - RecurringController: Recurring expense management
  - DashboardController: Summary statistics
- Services:
  - Repositories for data access
  - TokenService for JWT handling
  - RecurringPostingService for automatic recurring expense creation
  - SummaryService for dashboard data

## Ongoing Development

### Recently Completed
- [x] Fix: Dedupe API calls in dev (React 18 StrictMode)
- [x] Fix: Don't double-fetch today's expenses in dev
- [x] Feat: Show frontend + backend versions on every page
- [x] Fix: Vite dev proxy pointed at wrong port
- [x] Perf: Bundle dashboard endpoint + cache headers on slow-changing reads
- [x] Feat: Bulk-import expenses from pasted JSON

### Current Tasks
- [ ] Improve error handling and user feedback
- [ ] Add data export functionality (CSV, JSON)
- [ ] Implement data visualization for spending trends
- [ ] Add search functionality for expenses
- [ ] Enhance mobile experience for small screens

### Future Improvements
- [ ] Multi-user support with individual accounts
- [ ] Email notifications for budget alerts
- [ ] Integration with banking APIs for automatic transaction import
- [ ] Dark mode toggle
- [ ] Spending insights and recommendations
- [ ] Annual summary reports
- [ ] Category color coding for visual identification

## Development Setup

### Prerequisites
- Node.js 16+
- .NET 8 SDK
- MongoDB (local or Atlas)

### Running Locally

1. Server:
```bash
cd server
cp .env.example .env        # then edit values
dotnet run                  # listens on http://localhost:5198
```

2. Client:
```bash
cd client
npm install
npm run dev                 # listens on http://localhost:5173
```

### Environment Variables

Server (server/.env):
```
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=expenses_dev
ALLOWED_ORIGIN=http://localhost:5173
ADMIN_PASSWORD=local-dev-password
AUTH_JWT_SECRET=dev-secret-change-me-in-prod-please
```

## Deployment

- Backend → Render
- Frontend → Vercel
- Database → MongoDB Atlas

## Important Implementation Details

### Authentication
- Single shared password hashed with BCrypt
- JWT tokens for session management
- Middleware for protected routes

### Performance Optimizations
- Client-side caching of categories
- Server-side 'today' period filtering
- Cache headers on slow-changing reads
- Bundle dashboard endpoint responses

### Data Consistency
- Bulk import with idempotency (duplicate prevention)
- Category case-insensitive matching
- Automatic posting of recurring expenses

## Troubleshooting

### Common Issues

1. Vite proxy not working:
   - Check that server is running on correct port
   - Verify ALLOWED_ORIGIN in server .env

2. Authentication failing:
   - Ensure ADMIN_PASSWORD matches what you're entering
   - Check that server is properly generating JWT tokens

3. MongoDB connection issues:
   - Verify MONGODB_URI and MONGODB_DB in .env
   - Check that MongoDB service is running

### Development Tips

1. When adding new API endpoints:
   - Add corresponding service methods in appropriate repository
   - Update client api.js with new methods
   - Consider caching strategies for read-heavy endpoints

2. When modifying data models:
   - Update both frontend and backend representations
   - Consider migration strategies for existing data
   - Update import/export functionality if needed

3. Performance considerations:
   - Use server-side filtering when possible
   - Implement appropriate indexing in MongoDB
   - Add cache headers for infrequently changing data