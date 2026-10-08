# AI-Powered Inclusive Learning Platform

Everything below is built **into** the existing Eduverse app (same login, same
navbar, same theme, same database) — nothing is a separate demo. No existing
feature was removed; no new npm dependencies were added.

## 1. Set it up (3 steps)

1. **Run the database migration once** in the Supabase SQL editor:
   `backend/sql/migration_ai_learning.sql`
   (new databases get it automatically from `schema.sql`). It is idempotent and
   adds 5 tables; it does not touch any existing table.
2. *(Optional)* **Enable a real AI model** in `backend/.env`:
   `ANTHROPIC_API_KEY=...` or `GEMINI_API_KEY=...` (see `.env.example`).
   **Without any key everything still works** using the built-in offline tutor.
3. `cd backend && npm install && npm start` · `cd frontend && npm install && npm run dev`

Until step 1 is done the learning pages show a clear "run migration_ai_learning.sql"
message (HTTP 503) instead of crashing, and the rest of the app is unaffected.

## 2. Your 10 requirements → where they live

| Requirement | Where |
|---|---|
| Adaptive learning engine | `backend/src/utils/adaptiveEngine.js` (pure, unit-tested) |
| AI learning profile | table `learning_profiles` + `GET/PUT /api/ai/profile` + XP, level, streak |
| Content simplifier | `/tutor` → *Simplify text*, "Explain it more simply" in practice, lessons |
| Adaptive quiz easy → medium → hard | `/learn/practice` (`aiLearningController.js`) |
| Accessibility center | `/accessibility` + navbar menu (text size, high contrast, simplified text, Tamil/English, keyboard navigation, + reduce motion, dyslexia-friendly) |
| AI voice tutor | `/tutor` mic button (speak) + read-aloud (Web Speech API, English & Tamil) |
| Recommendations / weak topics / study assistant | `/learn`, Dashboard card, `recommendations.js`, 5-day plan, AI Tutor |
| Teacher/admin insights | Admin → **Learning Insights**, plus an "AI learning insights" section inside each student's detail modal |
| Integrated, not separate | New nav tabs, Dashboard card, student modal, shared auth/theme/DB |
| Preserve features, runnable ZIP | 11 existing files edited additively; all original tests still pass |

## 3. How the adaptive engine decides

* A session starts at a level derived from the student's **mastery** for the topic
  (< 40 % easy, < 70 % medium, else hard).
* **2 correct in a row → level up. 2 wrong in a row → level down.** One miss only
  resets the streak.
* A student who just answered wrong is **never escalated** to harder questions
  because the easy pool ran out; the session ends early with "review the lesson".
* Mastery is updated Elo-style (beating hard questions counts more; missing easy
  ones costs more). Weak = ≥ 3 attempts and (mastery < 45 % or accuracy < 50 %).
* Weak-topic detection also uses the student's **submitted quiz answers**: each
  admin-authored question is attributed to a topic by keyword
  (`topicClassifier.js` — a transparent heuristic, not a grade).

## 4. Security, privacy and academic integrity

* All AI endpoints need a signed-in **student account** token. The per-quiz
  "join" token has no `account` flag and gets **403**.
* The correct answer and explanation are never in the question the browser
  receives; each answer is validated server-side against the question the
  session is currently asking, with replay/double-click protection.
* **The AI Tutor and simplifier pause (HTTP 423) while the student has a live
  quiz attempt**, so they can't be used to answer proctored questions.
* Tutor logs store only the (truncated, 300 char) question + inferred topic,
  never the AI's answer. Students are told teachers can see topics they ask about.
* AI output is rendered by a safe renderer (no `dangerouslySetInnerHTML`).
  Prompts treat student text as data, not instructions. Rate limits are per student.
* Voice recognition runs in the browser; Chrome/Edge send audio to their own
  speech service. No audio reaches this platform's server.
* Teacher "Refine with AI" sends **aggregate numbers only** — no student names.

## 5. API summary (`/api/ai`, student account required unless noted)

`GET /status` (public) · `GET|PUT /profile` · `GET /curriculum` · `GET /recommendations`
· `GET /adaptive` · `POST /adaptive/start` · `GET /adaptive/:id` · `POST /adaptive/:id/answer`
· `POST /tutor` · `POST /simplify`

Admin (`/api/admin/learning`): `GET /overview?department=&section=&batch=` ·
`GET /students/:id` · `POST /suggestions`

## 6. Extending it

* **More questions / topics**: edit `backend/src/data/curriculum.js` (plain data,
  no migration). The first option in each question is the correct one — the
  engine shuffles per serving. Keep ≥ 2 questions per level per topic.
* **Add a language**: add strings to `frontend/src/lib/i18n.js` and `ta`-style
  fields in the curriculum.

## 7. Testing performed

* Backend: **84 tests pass** (37 original + 47 new: engine, grading, isolation,
  replay/concurrency, integrity guard, AI fallback, admin insights).
* Frontend: production build OK; lint = original warnings only.
* Real browser (Chromium) end-to-end against the real Express server: adaptive
  climb/no-escalation, accessibility modes + persistence + server sync, skip link,
  keyboard shortcuts, voice tutor (faked speech engine) in English and Tamil,
  Dashboard integration, admin insights, and a 160-combination layout sweep
  (language × text size × dyslexia mode × viewport width).

## 8. Known limits (please read)

* Tested with an **in-memory database** and **mocked AI/speech**, not against your
  live Supabase, a live Gemini/Anthropic key, or a physical microphone. Run the
  migration and try one practice round + one tutor question after deploying.
* The question bank is **36 questions over 6 topics** (Python-oriented). Sessions
  are short by design; grow the bank for longer adaptive runs.
* The **Tamil text was written by an AI** — have a Tamil-speaking teacher review it.
  Offline Tamil rewriting of *arbitrary pasted text* needs the AI key (the UI says
  so); lessons, practice and glossary are fully Tamil offline.
* Tamil UI covers the new features and the main navigation. Existing pages
  (quiz runner, programming playground, etc.) remain English.
* Voice input needs Chrome/Edge; Tamil speech output needs a Tamil voice installed
  on the device (the UI warns when it is missing).
* The navbar desktop layout now starts at 1024 px (was 768 px) to fit the new tabs.
