# Team Insights update

Adds role, progress, performance, completed tasks, skills, achievements and
dashboard activities to **Team Search**, and a full **Team insights** view for
created teams. No existing endpoint, table or screen was removed or renamed.

## What you get

**Team Search → Students / Mentors**: each result shows the person's role
(Student, Student · Team Leader, Mentor), progress %, performance % with a label,
completed tasks, XP/streak/quizzes/code runs/projects, skills, achievements and
recent dashboard activities (expand with *View details*). Mentors can now browse
Team Search too (read-only; owners still invite mentors).

**Team Search → Teams**: each result shows the Team Leader, Mentor(s), overall
team progress, team performance, task completion, active members, total XP, top
performers, and *View every member's activity & progress* for the full roster.

**My team → Team insights tab** (students and mentors): overall team progress,
top-3 performers, Team Leader, Mentor(s), every member with rank, progress,
performance, achievements, skills and activities, plus recent team activity.
Members tab now tags the Team Leader. The mentor's *View dashboard* page also
shows the member's derived insight card.

## API (all require a signed-in student or mentor account)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/teams/search?type=student\|mentor\|team&q=` | Same params as before; results are now enriched (additive fields). |
| GET | `/api/teams/:teamId/insights` | **New.** Leader, mentors, ranked members, summary, top performers, recent activity. |
| GET | `/api/teams/:teamId/members/:studentId` | Mentor overview; adds an `insights` field. Existing fields unchanged. |

## How values are derived (no new tables)

* **Progress** = average of curriculum mastery (sum of topic mastery ÷ topics),
  average quiz %, and task completion % (only the parts that exist).
* **Performance** = weighted quiz % (35), task completion (30), practice
  accuracy (20), engagement from XP + streak (15), re-weighted over what exists.
  Labels: Outstanding ≥85, Strong ≥70, Steady ≥50, Developing ≥25.
* **Skills** = topics with ≥40% mastery (Beginner/Intermediate/Advanced) and
  languages with successful playground runs. Mentors show *Mentoring focus*
  (their mentees' strongest areas).
* **Achievements** = rule-based badges (streaks, XP, quizzes, topic mastery,
  coding, tasks, projects, Team Leader; mentor badges for mentees/tasks/chat).
* **Top performers / rank** = performance, then progress, then XP.
* Activity is read from the most recent 1,000 rows per table per request.

## Privacy

Only aggregates and short labels are returned. Never exposed: e-mail, mobile,
register number, password data, source code/output, per-quiz marks, task or
project titles/URLs, chat messages.

## Database

Nothing required. Optional: run `backend/sql/migration_team_insights.sql`
(indexes only) after `migration_teams_mentors.sql`. If learning tables from older
migrations are missing, those parts degrade to zeros instead of erroring; if the
team tables are missing the API returns the existing actionable 503.

## Tests

`cd backend && npm test` (adds `tests/team-insights.test.js`, 9 tests).
