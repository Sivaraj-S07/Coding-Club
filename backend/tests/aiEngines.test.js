const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../src/utils/adaptiveEngine");
const { buildRecommendations, nextStreak } = require("../src/utils/recommendations");
const { localTutorReply, localSimplify } = require("../src/utils/localTutor");
const { classifyTopic } = require("../src/utils/topicClassifier");
const { QUESTIONS, TOPICS } = require("../src/data/curriculum");

test("level moves up after 2 correct, down after 2 wrong, and a single miss only resets the streak", () => {
  let st = { level: "easy", correctStreak: 0, wrongStreak: 0 };
  const step = (ok) => {
    const r = engine.applyAnswerToState(st, ok);
    st = { level: r.to, correctStreak: r.correctStreak, wrongStreak: r.wrongStreak };
    return r;
  };
  assert.equal(step(true).direction, "same");
  assert.equal(step(true).to, "medium");
  assert.equal(step(true).direction, "same");
  assert.equal(step(true).to, "hard");
  assert.equal(step(true).to, "hard", "cannot climb past hard");
  assert.equal(step(false).direction, "same", "one miss does not drop the level");
  assert.equal(step(false).to, "medium");
  step(false);
  assert.equal(step(false).to, "easy");
  step(false);
  assert.equal(step(false).to, "easy", "cannot fall below easy");
});

test("starting level follows mastery", () => {
  assert.equal(engine.startingLevel(0.1), "easy");
  assert.equal(engine.startingLevel(0.5), "medium");
  assert.equal(engine.startingLevel(0.9), "hard");
  assert.equal(engine.startingLevel(undefined), "easy");
});

test("mastery rises on correct, falls on wrong, and hard questions move it more than easy ones", () => {
  const m = 0.5;
  assert.ok(engine.updateMastery(m, "easy", true) > m);
  assert.ok(engine.updateMastery(m, "easy", false) < m);
  assert.ok(engine.updateMastery(m, "hard", true) - m > engine.updateMastery(m, "easy", true) - m);
  assert.ok(m - engine.updateMastery(m, "easy", false) > m - engine.updateMastery(m, "hard", false));
  for (let i = 0; i < 100; i++) assert.ok(engine.updateMastery(0.99, "easy", true) <= 1);
  assert.ok(engine.updateMastery(0.01, "hard", false) >= 0);
});

test("the question sent to the browser never contains the answer or explanation", () => {
  for (const q of QUESTIONS) {
    const served = engine.serveQuestion(q);
    const pub = engine.publicQuestion(q, served.order, "en");
    const keys = Object.keys(pub).sort().join(",");
    assert.equal(keys, "id,level,options,text,topicId");
    assert.equal(pub.options.length, q.options.length);
    assert.equal(new Set(pub.options).size, pub.options.length);
  }
});

test("grading maps the shuffled index back to the right option for every question and order", () => {
  for (const q of QUESTIONS) {
    for (let run = 0; run < 12; run++) {
      const served = engine.serveQuestion(q);
      const pub = engine.publicQuestion(q, served.order, "en");
      const correctShown = pub.options.indexOf(q.options[0]);
      assert.equal(engine.gradeAnswer(q, served.order, correctShown).correct, true);
      for (let i = 0; i < pub.options.length; i++) {
        if (i !== correctShown) assert.equal(engine.gradeAnswer(q, served.order, i).correct, false);
      }
      assert.equal(engine.gradeAnswer(q, served.order, correctShown).correctIndex, correctShown);
    }
  }
});

test("invalid selections are rejected, not graded as wrong", () => {
  const q = QUESTIONS[0];
  const served = engine.serveQuestion(q);
  for (const bad of [-1, 4, 99, "x", null, undefined, 1.5]) assert.equal(engine.gradeAnswer(q, served.order, bad).valid, false);
});

test("Tamil is served when available and falls back to English per question", () => {
  const withTa = QUESTIONS.find((q) => q.optionsTa);
  const served = engine.serveQuestion(withTa);
  const ta = engine.publicQuestion(withTa, served.order, "ta");
  assert.notDeepEqual(ta.options, engine.publicQuestion(withTa, served.order, "en").options);
  const plain = QUESTIONS.find((q) => !q.optionsTa);
  const s2 = engine.serveQuestion(plain);
  assert.deepEqual(engine.publicQuestion(plain, s2.order, "ta").options, engine.publicQuestion(plain, s2.order, "en").options);
  assert.ok(/[\u0B80-\u0BFF]/.test(engine.publicQuestion(plain, s2.order, "ta").text), "stem is Tamil");
});

test("every question has Tamil text and explanation, valid shape, and a unique id", () => {
  const ids = new Set();
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id)); ids.add(q.id);
    assert.ok(TOPICS.some((t) => t.id === q.topic));
    assert.ok(["easy", "medium", "hard"].includes(q.level));
    assert.equal(q.options.length, 4);
    assert.ok(/[\u0B80-\u0BFF]/.test(q.q.ta), `${q.id} missing Tamil stem`);
    assert.ok(/[\u0B80-\u0BFF]/.test(q.explain.ta), `${q.id} missing Tamil explanation`);
  }
  for (const t of TOPICS) {
    for (const lvl of ["easy", "medium", "hard"]) assert.ok(QUESTIONS.filter((q) => q.topic === t.id && q.level === lvl).length >= 2, `${t.id}/${lvl} needs >=2`);
  }
});

test("pickQuestion never repeats within a session, prefers the wanted level, and runs dry cleanly", () => {
  const seen = [];
  let level = "medium";
  for (let i = 0; i < 6; i++) {
    const q = engine.pickQuestion({ topicId: "loops", level, seenInSession: seen });
    assert.ok(q);
    assert.ok(!seen.includes(q.id));
    if (i === 0) assert.equal(q.level, "medium");
    seen.push(q.id);
  }
  assert.equal(engine.pickQuestion({ topicId: "loops", level, seenInSession: seen }), null);
});

test("a struggling student is never escalated to harder questions when the easy pool runs out", () => {
  const easy = QUESTIONS.filter((q) => q.topic === "loops" && q.level === "easy").map((q) => q.id);
  assert.equal(engine.pickQuestion({ topicId: "loops", level: "easy", seenInSession: easy, allowHarder: false }), null);
  // ...but after a correct answer escalation is fine
  assert.ok(engine.pickQuestion({ topicId: "loops", level: "easy", seenInSession: easy, allowHarder: true }));
  // an exhausted medium pool falls back to EASIER first when escalation is not allowed
  const medium = QUESTIONS.filter((q) => q.topic === "loops" && q.level === "medium").map((q) => q.id);
  for (let i = 0; i < 20; i++) {
    const q = engine.pickQuestion({ topicId: "loops", level: "medium", seenInSession: medium, allowHarder: false });
    assert.equal(q.level, "easy");
  }
});

test("pickQuestion prefers questions not answered recently", () => {
  const all = QUESTIONS.filter((q) => q.topic === "loops" && q.level === "easy").map((q) => q.id);
  for (let i = 0; i < 20; i++) {
    const q = engine.pickQuestion({ topicId: "loops", level: "easy", recentIds: [all[0]] });
    assert.equal(q.id, all[1]);
  }
});

test("mixed sessions start with the weakest topic and don't repeat a topic back to back", () => {
  const masteryByTopic = { variables: 0.9, conditionals: 0.8, loops: 0.2, strings: 0.6, lists: 0.7, functions: 0.5 };
  assert.equal(engine.pickTopicForMixed({ masteryByTopic }), "loops");
  assert.notEqual(engine.pickTopicForMixed({ masteryByTopic, lastTopicId: "loops" }), "loops");
});

test("recommendations: weak topic, next topic, review, plan and quiz-only fallback", () => {
  const old = new Date(Date.now() - 10 * 864e5).toISOString();
  const rec = buildRecommendations({
    masteryRows: [
      { topic_id: "variables", mastery: 0.85, attempts: 8, correct: 7, last_practiced_at: old },
      { topic_id: "conditionals", mastery: 0.3, attempts: 6, correct: 2, last_practiced_at: new Date().toISOString() },
    ],
    quizSignals: { loops: { attempted: 5, correct: 1 } },
  });
  assert.deepEqual(rec.weakTopics.map((t) => t.topicId).sort(), ["conditionals", "loops"]);
  assert.equal(rec.strengths[0].topicId, "variables");
  assert.equal(rec.review[0].topicId, "variables");
  assert.equal(rec.next.topicId, "strings");
  assert.equal(rec.actions[0].reason, "weak");
  assert.ok(rec.plan.length >= 8 && rec.plan.every((p) => p.day >= 1 && p.day <= 5));
  assert.equal(rec.overall.key, "intermediate");
});

test("recommendations for a brand-new student start with a mixed placement practice", () => {
  const rec = buildRecommendations({});
  assert.equal(rec.overall.key, "not-started");
  assert.equal(rec.weakTopics.length, 0);
  assert.equal(rec.actions[0].reason, "start");
  assert.equal(rec.next.topicId, "variables");
});

test("a topic with too little evidence is never labelled weak", () => {
  const rec = buildRecommendations({ masteryRows: [{ topic_id: "loops", mastery: 0.1, attempts: 2, correct: 0 }] });
  assert.equal(rec.weakTopics.length, 0);
});

test("streak: same day keeps it, next day extends, a gap resets", () => {
  const d = (s) => new Date(`${s}T10:00:00Z`);
  assert.equal(nextStreak({ lastActiveDate: "2026-10-05", streakDays: 4 }, d("2026-10-05")).streakDays, 4);
  assert.equal(nextStreak({ lastActiveDate: "2026-10-04", streakDays: 4 }, d("2026-10-05")).streakDays, 5);
  assert.equal(nextStreak({ lastActiveDate: "2026-10-01", streakDays: 4 }, d("2026-10-05")).streakDays, 1);
  assert.equal(nextStreak({ lastActiveDate: null, streakDays: 0 }, d("2026-10-05")).streakDays, 1);
});

test("offline tutor answers from lessons in English and Tamil, concisely for voice", () => {
  const en = localTutorReply({ message: "Can you explain while loops?", lang: "en" });
  assert.equal(en.topicId, "loops");
  assert.ok(en.reply.includes("```python"));
  const ta = localTutorReply({ message: "recursion பற்றி சொல்லுங்கள்", lang: "ta" });
  assert.equal(ta.topicId, "functions");
  assert.ok(/[\u0B80-\u0BFF]/.test(ta.reply));
  const voice = localTutorReply({ message: "what is a list", lang: "en", mode: "voice" });
  assert.ok(!voice.reply.includes("```") && !voice.reply.includes("**"));
  const unknown = localTutorReply({ message: "who won the match yesterday", lang: "en" });
  assert.equal(unknown.topicId, null);
});

test("offline simplifier gives grammatical short sentences, steps, terms and an example", () => {
  const r = localSimplify({
    text: "In order to utilize the function, you must subsequently invoke it with a parameter, which is an input value that the function requires, and it will execute the body.",
  });
  assert.ok(!/\butilize\b|\bsubsequently\b|\binvoke\b/i.test(r.simple));
  assert.ok(r.simple.includes("needs"), "requires -> needs keeps the verb agreement");
  assert.ok(r.steps.length >= 2);
  assert.ok(r.keyTerms.some((k) => k.term === "parameter"));
  assert.equal(r.topicId, "functions");
  assert.ok(r.example && r.example.code.includes("def"));
});

test("offline simplifier is honest about Tamil when it has no lesson match", () => {
  const generic = localSimplify({ text: "The compiler translates source code into machine instructions.", lang: "ta" });
  assert.equal(generic.note, "ta-needs-ai");
  assert.ok(generic.keyTerms.length && /[\u0B80-\u0BFF]/.test(generic.keyTerms[0].meaning));
  const lesson = localSimplify({ text: "A for loop uses range to iterate.", lang: "ta" });
  assert.equal(lesson.translated, true);
  assert.ok(/[\u0B80-\u0BFF]/.test(lesson.simple));
});

test("code blocks survive simplification untouched", () => {
  const r = localSimplify({ text: "Use a loop.\n```python\nfor i in range(3):\n    print(i)\n```" });
  assert.equal(r.example.code, "for i in range(3):\n    print(i)");
  assert.equal(r.example.language, "python");
});

test("topic classifier is conservative", () => {
  assert.equal(classifyTopic("What is a for loop and how does range work?"), "loops");
  assert.equal(classifyTopic("How do I slice a string?"), "strings");
  assert.equal(classifyTopic("Tell me a joke"), null);
  assert.equal(classifyTopic(""), null);
});

test('offline tutor resolves follow-up examples from the preceding conversation', () => {
  const reply = localTutorReply({message:'another example please',history:[{role:'user',content:'explain loops'}]});
  assert.equal(reply.topicId,'loops');
});
