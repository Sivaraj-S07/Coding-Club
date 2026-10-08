#!/usr/bin/env node
/**
 * Verifies that every programming-question runtime is pre-installed.
 * Run this once after deploying:  node scripts/check-runtimes.js
 *
 * Exit code 0 = all runtimes ready, 1 = at least one is missing.
 * Nothing is ever installed by this script (or by the server at runtime).
 */
const { warmupRuntimes, executeLocally } = require("../src/utils/localRunner");

const SMOKE = {
  python: { source: "print(input())", stdin: "hello-python\n", expect: "hello-python" },
  c: {
    source: '#include <stdio.h>\nint main(){char b[64];if(scanf("%63s",b)==1)printf("%s",b);return 0;}',
    stdin: "hello-c\n",
    expect: "hello-c",
  },
  cpp: {
    source: "#include <iostream>\nint main(){std::string s;std::cin>>s;std::cout<<s;return 0;}",
    stdin: "hello-cpp\n",
    expect: "hello-cpp",
  },
  java: {
    source:
      "import java.util.Scanner;public class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.print(s.next());}}",
    stdin: "hello-java\n",
    expect: "hello-java",
  },
};

(async () => {
  const report = await warmupRuntimes({ log: false });
  let ok = true;
  for (const [language, info] of Object.entries(report)) {
    if (!info.available) {
      ok = false;
      console.log(`✗ ${language.padEnd(7)} missing — ${info.reason}`);
      continue;
    }
    const smoke = SMOKE[language];
    const run = await executeLocally({ language, ...smoke, timeLimitMs: 10000 });
    const passed = run.status === "ok" && run.stdout.trim() === smoke.expect;
    if (!passed) ok = false;
    console.log(
      `${passed ? "✓" : "✗"} ${language.padEnd(7)} ${info.version} ${passed ? `(${run.timeMs} ms)` : `→ ${run.status} ${run.message || run.compileOutput || run.stderr}`}`
    );
  }
  console.log(ok ? "\nAll runtimes are pre-installed and working." : "\nSome runtimes are missing — install them on the server before running quizzes.");
  process.exit(ok ? 0 : 1);
})();
