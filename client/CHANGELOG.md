# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure with React frontend and .NET backend
- Expense tracking functionality with categories
- User authentication with JWT and shared password
- Recurring expense management
- Bulk import capability for expenses
- Category budget tracking
- Month-over-month trend analysis

### Changed
- Improved performance with client-side category caching
- Enhanced development experience with proper Vite proxy configuration
- Optimized API endpoints with caching headers for slow-changing reads
- Fixed double-fetching issues in React development mode

### Fixed
- Vite dev proxy pointing to correct port
- Vercel rewrites for SPA routing
- Render.yaml configuration to use Docker runtime with .NET 8 SDK image
- Deduplication of API calls in React 18 StrictMode
- Issue with fetching today's expenses in development mode

## [1.0.0] - 2026-06-24

### Added
- Initial release of Ledger - Personal Expense Tracker
- Single-user authentication with shared password
- Expense entry with amount, category, date, and optional notes
- Category management (create, edit, delete)
- Budget tracking by category
- Recurring expense setup
- History view with filtering capabilities
- Bulk import from JSON data
- Dashboard with monthly summaries and trends
- Responsive design for mobile and desktop

[Unreleased]: https://github.com/your-username/ledger/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-username/ledger/releases/tag/v1.0.0