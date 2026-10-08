const bcrypt = require("bcryptjs");

const QUIZ_PASSWORD = "Secret#123 with spaces";

// A deliberately awkward quiz: every setting non-default, rows inserted out of
// order, code with tabs/indentation, multi-blank fill-in, unassigned question.
async function seedRichQuiz(db, { quizId = "11111111-1111-4111-8111-111111111111", password = QUIZ_PASSWORD } = {}) {
  const roundA = "aaaaaaaa-0000-4000-8000-00000000000a";
  const roundB = "bbbbbbbb-0000-4000-8000-00000000000b";

  db.rows.quizzes.push({
    id: quizId,
    title: "Full Stack Sprint — “Round-Robin” ✓ தமிழ்",
    description: "Line one\nLine two with <b>html</b> & symbols",
    password_hash: await bcrypt.hash(password, 10),
    duration_minutes: 45,
    start_time: "2030-01-15T09:30:00+00:00",
    end_time: "2030-01-15T12:00:00+00:00",
    max_marks: 33,
    passing_percentage: 55.5,
    max_attempts: 2,
    randomize_questions: false,
    randomize_options: true,
    auto_submit: false,
    allow_late_join: true,
    show_leaderboard: false,
    tab_switch_limit: 5,
    status: "live",
    placement: "quizzes",
    created_at: "2029-12-01T00:00:00Z",
    updated_at: "2029-12-01T00:00:00Z",
  });

  // Inserted in reverse so ordering can't pass by accident.
  db.rows.rounds.push(
    { id: roundB, quiz_id: quizId, name: "Round 2 — Coding", description: null, order_index: 1, qualification_percentage: 0 },
    { id: roundA, quiz_id: quizId, name: "Round 1 — Aptitude", description: "Warm-up round", order_index: 0, qualification_percentage: 62.5 }
  );

  const q = (id, extra) => ({
    id,
    quiz_id: quizId,
    question_type: "mcq",
    negative_marks: 0,
    marks: 1,
    round_id: null,
    ...extra,
  });
  const ids = {
    mcq1: "c0000000-0000-4000-8000-000000000001",
    mcq2: "c0000000-0000-4000-8000-000000000002",
    blank: "c0000000-0000-4000-8000-000000000003",
    coding: "c0000000-0000-4000-8000-000000000004",
    loose: "c0000000-0000-4000-8000-000000000005",
  };

  db.rows.questions.push(
    q(ids.coding, {
      question_text: "Write a function that adds two numbers.",
      marks: 10,
      negative_marks: 2,
      order_index: 0,
      round_id: roundB,
      question_type: "coding",
      language: "python",
      allowed_languages: ["python", "cpp"],
      starter_code: "def add(a, b):\n\t# TODO\n    return None\n",
      reference_solution: "def add(a, b):\n    return a + b\n",
      expected_output: "7",
      problem_statement: "Read two ints and print their sum.",
      input_format: "Two space separated integers",
      output_format: "One integer",
      constraints_text: "1 <= a, b <= 10^9",
      sample_io: [{ input: "3 4", output: "7", explanation: "3 + 4" }],
      test_cases: [
        { name: "Basic", input: "3 4", expectedOutput: "7", hidden: false },
        { name: "Big", input: "1000000000 1000000000", expectedOutput: "2000000000", hidden: true },
      ],
      time_limit_ms: 5000,
      time_limit_seconds: 900,
    }),
    q(ids.loose, {
      question_text: "Unassigned question",
      order_index: 0,
      round_id: null,
    }),
    q(ids.blank, {
      question_text: "The capital of France is ___ and its country is ___.",
      marks: 3,
      order_index: 2,
      round_id: roundA,
      question_type: "fill_blank",
      blank_answers: [["paris"], ["france", "french republic"]],
      case_sensitive: true,
    }),
    q(ids.mcq2, {
      question_text: "Second MCQ",
      marks: 1,
      order_index: 1,
      round_id: roundA,
    }),
    q(ids.mcq1, {
      question_text: "What is 2 + 2?",
      marks: 2,
      negative_marks: 0.5,
      order_index: 0,
      round_id: roundA,
      time_limit_seconds: 60,
    })
  );

  const opt = (question_id, text, isCorrect, order_index, id) => ({
    id: id || `${question_id}-${order_index}`.replace(/^c0/, "d0"),
    question_id,
    option_text: text,
    is_correct: isCorrect,
    order_index,
  });
  // Options inserted out of order as well.
  db.rows.quiz_options.push(
    opt(ids.mcq1, "22", false, 3),
    opt(ids.mcq1, "4", true, 1),
    opt(ids.mcq1, "3", false, 0),
    opt(ids.mcq1, "5", false, 2),
    opt(ids.mcq2, "Yes", true, 0),
    opt(ids.mcq2, "No", false, 1),
    opt(ids.loose, "Not padded", false, 0),
    opt(ids.loose, "Because", true, 1)
  );

  return { quizId, roundA, roundB, ids, password };
}

module.exports = { seedRichQuiz, QUIZ_PASSWORD };
