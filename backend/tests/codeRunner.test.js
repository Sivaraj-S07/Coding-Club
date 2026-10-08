const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { executeLocally, discoverLanguage, disposeLocalSession } = require('../src/utils/localRunner');
const { runTestCases } = require('../src/utils/codeRunner');
const programs = {
  c: '#include <stdio.h>\nint main(){int n;scanf("%d",&n);printf("%d\\n",n*2);return 0;}',
  cpp: '#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n*2<<"\\n";}',
  python: 'print(int(input())*2)',
  java: 'import java.util.Scanner; public class Main { public static void main(String[] args){int n=new Scanner(System.in).nextInt();System.out.println(n*2);} }',
};
for (const [language, source] of Object.entries(programs)) {
  test(`${language}: stdin, repeated cases, and compile-once cleanup`, async (t) => {
    if (!(await discoverLanguage(language)).available) return t.skip(`${language} runtime not installed`);
    const session = {};
    try {
      const first = await executeLocally({ language, source, stdin: '3\n', session });
      assert.equal(first.status, 'ok', JSON.stringify(first));
      assert.equal(first.stdout.trim(), '6');
      assert.equal(session.compiled, true);
      const second = await executeLocally({ language, source, stdin: '7\n', session });
      assert.equal(second.status, 'ok', JSON.stringify(second));
      assert.equal(second.stdout.trim(), '14');
    } finally { await disposeLocalSession(session); }
    await assert.rejects(fs.stat(session.dir), { code: 'ENOENT' });
    const judged = await runTestCases({ language, source, testCases: [
      { input: '2\n', expectedOutput: '4' }, { input: '8\n', expectedOutput: '16' },
    ] });
    assert.equal(judged.passed, 2, JSON.stringify(judged));
  });
}
test('Python: Unicode output stays intact across split byte writes', async (t) => {
  if (!(await discoverLanguage('python')).available) return t.skip('Python runtime not installed');
  const result = await executeLocally({ language: 'python', source: 'import os, time\nfor b in "வணக்கம் 🌍".encode():\n os.write(1, bytes([b]))\n time.sleep(0.001)' });
  assert.equal(result.status, 'ok');
  assert.equal(result.stdout, 'வணக்கம் 🌍');
});
test('Python: reused compilation does not reuse student-created files', async (t) => {
  if (!(await discoverLanguage('python')).available) return t.skip('Python runtime not installed');
  const session = {};
  const source = 'import os\nprint(os.path.exists("marker"))\nopen("marker", "w").write("data")';
  try {
    for (let i = 0; i < 2; i++) {
      const result = await executeLocally({ language: 'python', source, session });
      assert.equal(result.status, 'ok');
      assert.equal(result.stdout.trim(), 'False');
    }
  } finally { await disposeLocalSession(session); }
});
test('Python: infinite loops time out and Stop terminates a running process', async (t) => {
  if (!(await discoverLanguage('python')).available) return t.skip('Python runtime not installed');
  assert.equal((await executeLocally({ language: 'python', source: 'while True: pass', timeLimitMs: 100 })).status, 'time_limit_exceeded');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try { assert.equal((await executeLocally({ language: 'python', source: 'while True: pass', signal: controller.signal })).status, 'aborted'); }
  finally { clearTimeout(timer); }
});
test('Java: named public class and additional helper source work', async (t) => {
  if (!(await discoverLanguage('java')).available) return t.skip('Java runtime not installed');
  const result = await executeLocally({ language: 'java', source: 'public class EduverseDemo { public static void main(String[] args){System.out.println(Helper.value());}}', files: [{ name: 'Helper.java', content: 'class Helper {static String value(){return "Eduverse";}}' }] });
  assert.equal(result.status, 'ok', JSON.stringify(result));
  assert.equal(result.stdout.trim(), 'Eduverse');
});
test('C: compile errors are reported without running hidden test cases', async (t) => {
  if (!(await discoverLanguage('c')).available) return t.skip('C runtime not installed');
  const result = await runTestCases({ language: 'c', source: 'int main( {', testCases: [{input:'',expectedOutput:'x'}] });
  assert.equal(result.status, 'compile_error');
  assert.ok(result.compileOutput.length);
});
