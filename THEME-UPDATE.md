# Premium Dark Glassmorphism + Neon Blue-Purple theme

Frontend-only upgrade. No backend, route, API or business-logic changes.

## Where the theme lives
- `frontend/tailwind.config.js`: palette (void, electric, violet, ink, mint, amber, coral), Space Grotesk / Inter / JetBrains Mono, glow shadows, keyframes.
- `frontend/src/index.css`: design tokens, animated aurora + grid background, `.glass` surfaces, `.btn-neon`, `.btn-glass`, `.chip`, `.icon-tile`, `.text-gradient`, form fields, team/insight layouts, and every accessibility mode (simple, high contrast, dyslexia, text size, reduced motion).
- Shared components restyled: Logo, Badge, StatCard, ProgressRing, StudentNavbar, AdminSidebar, AdminLayout, modals.

## Sample data
`frontend/src/lib/demoData.js` supplies realistic quizzes, leaderboards, gallery posters, student results, playground runs and admin dashboard numbers.
Pages use it only when the API returns nothing (or the server is unreachable) and label it with a "Sample data" chip.
Sample records cannot be joined, edited or deleted, so they never trigger real API calls.
Set `VITE_DEMO_DATA=off` to disable the fallback for a deployment.

Pages with sample data: Home, Quizzes, Demo Quiz, Leaderboard, Gallery, Student Dashboard, Admin Dashboard, Admin Quizzes, Admin Leaderboard.

## Checks
`npm run build`, `npm test` (17 passing) and `npm run lint` (0 errors).
