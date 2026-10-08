/**
 * Shared, deterministic ranking for quiz attempts.
 *
 * Ranking priority (identical everywhere: student result page, admin results
 * page and the public leaderboard):
 *   1. Higher score (obtained marks) first.
 *   2. If scores are equal, the SHORTER completion time ranks higher
 *      (submitted_at - started_at). 30s beats 60s for the same score.
 *   3. Remaining ties fall back to whoever finished earlier in wall-clock
 *      time, then the attempt id — never random order and never database
 *      insertion order.
 */

function toTime(value) {
  const t = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

function timeTakenSeconds(attempt) {
  const started = toTime(attempt.started_at);
  const submitted = toTime(attempt.submitted_at);
  if (started === null || submitted === null) return null;
  return Math.max(0, Math.round((submitted - started) / 1000));
}

function compareAttempts(a, b) {
  const scoreA = Number(a.obtained_marks || 0);
  const scoreB = Number(b.obtained_marks || 0);
  if (scoreA !== scoreB) return scoreB - scoreA; // higher score first

  // Equal score → the student who took LESS time ranks higher.
  const takenA = timeTakenSeconds(a);
  const takenB = timeTakenSeconds(b);
  if (takenA !== takenB) {
    if (takenA === null) return 1; // unknown duration goes last
    if (takenB === null) return -1;
    return takenA - takenB;
  }

  // Same score and same duration → whoever finished earlier.
  const subA = toTime(a.submitted_at);
  const subB = toTime(b.submitted_at);
  if (subA !== subB) {
    if (subA === null) return 1;
    if (subB === null) return -1;
    return subA - subB;
  }

  return String(a.id || "").localeCompare(String(b.id || ""));
}

/**
 * Returns a NEW array of attempts sorted by the ranking rules, each carrying
 * a 1-based `__rank`. Attempts that tie on BOTH score and completion time
 * share the same rank number.
 */
function rankAttempts(attempts) {
  const sorted = [...(attempts || [])].sort(compareAttempts);
  let lastRank = 0;
  let previous = null;
  return sorted.map((a, index) => {
    const tiedWithPrevious =
      previous &&
      Number(previous.obtained_marks || 0) === Number(a.obtained_marks || 0) &&
      timeTakenSeconds(previous) === timeTakenSeconds(a);
    const rank = tiedWithPrevious ? lastRank : index + 1;
    lastRank = rank;
    previous = a;
    return { ...a, __rank: rank };
  });
}

module.exports = { rankAttempts, compareAttempts, timeTakenSeconds };
