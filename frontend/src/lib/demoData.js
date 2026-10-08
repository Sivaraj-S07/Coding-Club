/**
 * Sample data for Eduverse.
 *
 * Pages call these helpers only when the live API returns nothing (or can't
 * be reached), so a fresh install, a demo deployment or a screenshot always
 * looks fully populated. Real data always wins as soon as it exists.
 *
 * Turn the fallback off for a deployment by setting VITE_DEMO_DATA=off.
 * Every sample record carries `demo: true` so pages can label it and
 * disable actions that need a real record (joining, deleting, editing).
 */

export const DEMO_ENABLED = String(import.meta.env.VITE_DEMO_DATA || "on").toLowerCase() !== "off";

export const isDemoId = (id) => typeof id === "string" && id.startsWith("demo-");

const daysAgo = (d, h = 10, m = 0) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(h, m, 0, 0);
  return date.toISOString();
};

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

const PEOPLE = [
  ["Arun Kumar", "23CS1001", "CSE", "II", "A"],
  ["Priya Dharshini", "23CS1014", "CSE", "II", "A"],
  ["Karthik Raja", "23IT2007", "IT", "II", "B"],
  ["Meenakshi Sundaram", "22CS1033", "CSE", "III", "B"],
  ["Harini Lakshmi", "23AD3011", "AI&DS", "II", "A"],
  ["Vignesh Babu", "22EC4021", "ECE", "III", "A"],
  ["Sandhya Rani", "23CS1046", "CSE", "II", "C"],
  ["Mohammed Faizal", "21IT2018", "IT", "IV", "A"],
  ["Divya Bharathi", "22AD3025", "AI&DS", "III", "B"],
  ["Naveen Prasath", "23CS1058", "CSE", "II", "C"],
  ["Keerthana Selvam", "22IT2039", "IT", "III", "A"],
  ["Rahul Venkatesh", "21CS1062", "CSE", "IV", "B"],
  ["Abinaya Murugan", "23EC4012", "ECE", "II", "A"],
  ["Surya Narayanan", "22ME5009", "MECH", "III", "A"],
  ["Lavanya Gopal", "23AD3034", "AI&DS", "II", "B"],
  ["Dinesh Kannan", "21IT2044", "IT", "IV", "B"],
  ["Nandhini Ravi", "22CS1071", "CSE", "III", "C"],
  ["Pradeep Anand", "23ME5021", "MECH", "II", "B"],
  ["Swetha Ramesh", "22EC4036", "ECE", "III", "B"],
  ["Gokul Krishnan", "21CS1085", "CSE", "IV", "A"],
];

const initials = (name) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

export { initials as demoInitials };

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */

const QUIZ_SEED = [
  ["Python Fundamentals Sprint", "Variables, loops, functions and list comprehensions in a fast 20-question warm-up.", "live", 20, 25, 148, 100, 40],
  ["Data Structures Showdown", "Stacks, queues, linked lists and trees. Includes two coding questions with hidden test cases.", "live", 25, 40, 112, 100, 50],
  ["C Programming Basics", "Pointers, arrays, strings and memory. Ideal for first-year students.", "upcoming", 30, 35, 0, 100, 40],
  ["Java OOP Challenge", "Inheritance, interfaces, polymorphism and exception handling, with fill-in-the-blank rounds.", "upcoming", 24, 30, 0, 100, 50],
  ["Algorithms & Complexity", "Sorting, searching and Big-O reasoning. One coding round at the end.", "completed", 22, 45, 96, 100, 50],
  ["SQL Query Masters", "Joins, group by, subqueries and window functions on a sample college database.", "completed", 18, 30, 134, 100, 40],
  ["Aptitude & Logical Reasoning", "Placement-style reasoning: series, puzzles, probability and data interpretation.", "completed", 40, 50, 187, 100, 40],
  ["Web Dev Lightning Round", "HTML, CSS, JavaScript and React hooks in a 15-minute lightning round.", "completed", 15, 15, 121, 100, 40],
  ["C++ STL Deep Dive", "Vectors, maps, iterators and algorithms from the Standard Template Library.", "completed", 20, 30, 78, 100, 50],
];

export function demoQuizzes() {
  return QUIZ_SEED.map(([title, description, status, questionCount, durationMinutes, participantCount, maxMarks, passingPercentage], i) => ({
    id: `demo-quiz-${i + 1}`,
    title,
    description,
    status,
    questionCount,
    durationMinutes,
    participantCount,
    maxMarks,
    passingPercentage,
    maxAttempts: 1,
    demo: true,
  }));
}

/** The first four sample quizzes double as the home page "demo quiz" list. */
export const demoLandingQuizzes = () => demoQuizzes().slice(0, 4);

/* ------------------------------------------------------------------ */
/* Leaderboards                                                        */
/* ------------------------------------------------------------------ */

export function demoLeaderboard(quizId) {
  const quiz = demoQuizzes().find((q) => q.id === quizId) || demoQuizzes()[0];
  const rows = PEOPLE.slice(0, 15).map(([name, registerNumber], i) => ({
    attemptId: `demo-attempt-${quiz.id}-${i + 1}`,
    rank: i + 1,
    name,
    registerNumber,
    score: Math.max(32, quiz.maxMarks - i * 4 - (i % 3) * 2),
    timeTakenSeconds: quiz.durationMinutes * 60 - 420 + i * 53,
    demo: true,
  }));
  return { quizTitle: quiz.title, leaderboard: rows };
}

export function demoAdminLeaderboard() {
  const leaderboard = PEOPLE.map(([name, registerNumber, department, year, section], i) => ({
    studentId: `demo-student-${i + 1}`,
    rank: i + 1,
    name,
    registerNumber,
    department,
    year,
    section,
    quizzesAttended: 9 - (i % 5),
    cumulativePercentage: Math.max(41, 96 - i * 2.6).toFixed(1),
    lastSubmittedAt: daysAgo(1 + (i % 9), 11 + (i % 5), 10 + i),
    demo: true,
  }));
  return { leaderboard, guests: [] };
}

/* ------------------------------------------------------------------ */
/* Gallery                                                             */
/* ------------------------------------------------------------------ */

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function poster(rawTitle, rawSubtitle, hueA, hueB, glyph) {
  const title = esc(rawTitle);
  const subtitle = esc(rawSubtitle);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="${title}">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hueA} 85% 22%)"/><stop offset="1" stop-color="hsl(${hueB} 80% 16%)"/></linearGradient>
<radialGradient id="r1" cx="0.2" cy="0.15" r="0.6"><stop offset="0" stop-color="hsl(${hueA} 95% 62%)" stop-opacity="0.55"/><stop offset="1" stop-color="hsl(${hueA} 95% 62%)" stop-opacity="0"/></radialGradient>
<radialGradient id="r2" cx="0.85" cy="0.9" r="0.55"><stop offset="0" stop-color="hsl(${hueB} 95% 66%)" stop-opacity="0.5"/><stop offset="1" stop-color="hsl(${hueB} 95% 66%)" stop-opacity="0"/></radialGradient>
<pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#fff" stroke-opacity="0.06"/></pattern>
</defs>
<rect width="1200" height="800" fill="url(#g)"/><rect width="1200" height="800" fill="url(#p)"/>
<rect width="1200" height="800" fill="url(#r1)"/><rect width="1200" height="800" fill="url(#r2)"/>
<text x="600" y="420" text-anchor="middle" font-family="monospace" font-size="230" font-weight="700" fill="#fff" fill-opacity="0.9">${glyph}</text>
<text x="70" y="690" font-family="Arial, sans-serif" font-size="54" font-weight="700" fill="#fff">${title}</text>
<text x="70" y="740" font-family="Arial, sans-serif" font-size="30" fill="#fff" fill-opacity="0.7">${subtitle}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const GALLERY_SEED = [
  ["Code Sprint 2026", "Finals night in the main seminar hall.", "Forty-two students, three rounds and one very tense tie-breaker. The winners solved the last problem with eleven seconds to spare.", 215, 265, "&lt;/&gt;"],
  ["Hackathon Weekend", "24 hours, 18 teams, one campus.", "Teams built working prototypes for campus problems, from smart attendance to a canteen queue tracker.", 255, 300, "{ }"],
  ["Python Bootcamp", "Hands-on session for first years.", "A relaxed Saturday workshop that took 90 beginners from print statements to their first working script.", 195, 240, "py"],
  ["Industry Talk: Cloud & DevOps", "Guest session by alumni engineers.", "Two alumni walked through deploying a real application and answered questions about placements.", 270, 320, "#!"],
  ["Quiz League Awards", "Recognising this semester's top performers.", "Toppers from every department were recognised for consistent scores and fair-play attempts.", 285, 330, "A+"],
  ["Algorithm Study Circle", "Weekly problem-solving meet.", "A small group that meets every Thursday to solve one hard problem together and compare approaches.", 205, 250, "O(n)"],
  ["Web Dev Workshop", "React and Tailwind from scratch.", "Students shipped a personal landing page by the end of the afternoon and deployed it live.", 225, 285, "&lt;div&gt;"],
  ["Team Insights Launch", "Introducing mentors and teams.", "The new teams and mentors programme went live, pairing every team with a faculty or alumni mentor.", 250, 310, "&amp;&amp;"],
  ["Placement Prep Series", "Mock tests and mock interviews.", "Final-year students practised timed coding tests and mock interviews with feedback from mentors.", 190, 270, "&gt;_"],
];

export function demoMedia() {
  return GALLERY_SEED.map(([title, subtitle, caption, a, b, glyph], i) => ({
    id: `demo-media-${i + 1}`,
    type: "image",
    title,
    caption,
    url: poster(title, subtitle, a, b, glyph),
    demo: true,
  }));
}

/* ------------------------------------------------------------------ */
/* Student dashboard                                                   */
/* ------------------------------------------------------------------ */

export function demoStudentResults() {
  const rows = [
    ["Python Fundamentals Sprint", 18, 20, 1, 1, 2],
    ["SQL Query Masters", 13, 18, 3, 2, 3],
    ["Aptitude & Logical Reasoning", 29, 40, 4, 7, 6],
    ["Web Dev Lightning Round", 13, 15, 0, 2, 4],
    ["Algorithms & Complexity", 15, 22, 3, 4, 8],
    ["C++ STL Deep Dive", 14, 20, 2, 4, 12],
  ];
  const results = rows.map(([quizTitle, correct, total, wrong, unanswered, d], i) => {
    const percentage = Math.round((correct / total) * 1000) / 10;
    return {
      attemptId: `demo-attempt-${i + 1}`,
      quizId: `demo-quiz-${i + 1}`,
      quizTitle,
      submittedAt: daysAgo(d, 15, 20),
      obtainedMarks: correct * 5,
      totalMarks: total * 5,
      percentage,
      correct,
      wrong,
      unanswered,
      passed: percentage >= 50,
      demo: true,
    };
  });
  const cumulativePercentage = Math.round((results.reduce((s, r) => s + r.percentage, 0) / results.length) * 10) / 10;
  return { results, cumulativePercentage };
}

export function demoPlaygroundRuns() {
  return [
    {
      id: "demo-run-1",
      language: "python",
      status: "ok",
      createdAt: daysAgo(0, 9, 42),
      timeMs: 38,
      source: 'def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint([fib(i) for i in range(10)])\n',
      stdin: "",
      stdout: "[0, 1, 1, 2, 3, 5, 8, 13, 21, 34]\n",
      stderr: "",
      compileOutput: "",
      demo: true,
    },
    {
      id: "demo-run-2",
      language: "cpp",
      status: "ok",
      createdAt: daysAgo(1, 18, 5),
      timeMs: 112,
      source: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n    vector<int> v(n);\n    for (auto &x : v) cin >> x;\n    sort(v.begin(), v.end());\n    for (int x : v) cout << x << " ";\n    cout << "\\n";\n}\n',
      stdin: "5\n9 3 7 1 5\n",
      stdout: "1 3 5 7 9 \n",
      stderr: "",
      compileOutput: "",
      demo: true,
    },
    {
      id: "demo-run-3",
      language: "java",
      status: "ok",
      createdAt: daysAgo(3, 20, 31),
      timeMs: 245,
      source: 'public class Main {\n    public static void main(String[] args) {\n        StringBuilder sb = new StringBuilder("Eduverse");\n        System.out.println(sb.reverse());\n    }\n}\n',
      stdin: "",
      stdout: "esrevudE\n",
      stderr: "",
      compileOutput: "",
      demo: true,
    },
    {
      id: "demo-run-4",
      language: "c",
      status: "time_limit_exceeded",
      createdAt: daysAgo(5, 16, 12),
      timeMs: 2000,
      source: '#include <stdio.h>\n\nint main() {\n    int i = 0;\n    while (1) {\n        i++;\n    }\n    printf("%d", i);\n    return 0;\n}\n',
      stdin: "",
      stdout: "",
      stderr: "Time limit exceeded",
      compileOutput: "",
      demo: true,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Admin dashboard                                                     */
/* ------------------------------------------------------------------ */

export function demoAdminDashboard() {
  const quizzes = demoQuizzes();
  const quiz = (i) => quizzes[i].title;
  const recentActivity = [
    ["Arun Kumar", 4, 96, 0, 9, 15],
    ["Priya Dharshini", 1, 92, 0, 11, 40],
    ["Karthik Raja", 6, 88, 1, 14, 5],
    ["Harini Lakshmi", 4, 86, 1, 16, 22],
    ["Vignesh Babu", 7, 84, 1, 17, 48],
    ["Sandhya Rani", 5, 82, 2, 10, 12],
    ["Mohammed Faizal", 0, 80, 2, 13, 30],
    ["Divya Bharathi", 6, 78, 3, 15, 55],
  ].map(([name, q, score, d, h, m]) => ({ name, quiz: quiz(q), score, submittedAt: daysAgo(d, h, m) }));
  return {
    stats: {
      totalQuizzes: quizzes.length,
      totalStudents: 482,
      totalParticipants: 876,
      averageScore: 71.4,
      present: 812,
      absent: 64,
    },
    recentActivity,
  };
}
