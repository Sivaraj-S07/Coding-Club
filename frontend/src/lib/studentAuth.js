const STORAGE_KEY = "quizapp_student_sessions";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

/** Get the stored session ({ token, name, registerNumber }) for a quiz, or null. */
export function getStudentSession(quizId) {
  const sessions = readAll();
  return sessions[quizId] || null;
}

/** Save a student session for a given quiz id. */
export function setStudentSession(quizId, session) {
  const sessions = readAll();
  sessions[quizId] = session;
  writeAll(sessions);
}

export function clearStudentSession(quizId) {
  const sessions = readAll();
  delete sessions[quizId];
  writeAll(sessions);
}
