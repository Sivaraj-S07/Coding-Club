# Programming questions — code judge setup

Programming (coding) questions are now graded by actually running the student's
code against hidden test cases, LeetCode / HackerRank style.

## 1. Apply the database migration (required)

Open the Supabase SQL editor and run:

```
backend/sql/migration_programming_judge.sql
```

It only adds columns (`if not exists`) — no existing data is touched. Until it
is applied, coding questions keep working with the previous expected-output
grading and the server logs a one-time warning.

## 2. Choose how code is executed

Configured in `backend/.env`:

| Variable             | Default                                    | Meaning |
| -------------------- | ------------------------------------------ | ------- |
| `CODE_EXEC_ENABLED`  | `true`                                     | `false` disables execution entirely |
| `CODE_EXEC_PROVIDER` | `auto`                                     | `remote`, `local`, or `auto` (**local first**, remote fallback) |
| `CODE_EXEC_URL`      | *(empty)*                                  | Comma-separated Piston-compatible execute endpoints. Empty = local only |
| `CODE_EXEC_TOKEN`    | *(empty)*                                  | Optional `Authorization: Bearer` token for your sandbox |
| `CODE_EXEC_TIMEOUT`  | `15000`                                    | HTTP timeout for the remote judge, ms |

> The **public** Piston API (`emkc.org`) is whitelist-only since 2026-02-15 and
> answers `401`, so it is no longer a default. Leaving `CODE_EXEC_URL` empty is
> correct: the server executes with its own pre-installed compilers.

### Recommended for production: self-hosted Piston (isolated sandbox)

```bash
docker compose -f docker-compose.judge.yml up -d
docker exec piston piston-cli ppman install python 3.12.0
docker exec piston piston-cli ppman install gcc 10.2.0    # C and C++
docker exec piston piston-cli ppman install java 15.0.2
```

Install the runtimes **once, now** — never during a student's Run/Submit.

then set:

```
CODE_EXEC_PROVIDER=remote
CODE_EXEC_URL=http://localhost:2000/api/v2/execute
```

If the sandbox answers `401`/`403`, the judge reports a clear setup message
instead of leaking the provider error to students.

### Installing the local toolchains

```bash
cd backend
npm run setup:compilers            # report what is missing + the exact commands
npm run setup:compilers -- --install   # run them (winget/choco/apt/dnf/pacman/apk/brew)
npm run check:runtimes             # smoke-test C, C++, Java, Python
```

On Windows, do not rely on the Microsoft Store `python` alias or the Python
Install Manager: they are installer stubs, and the judge deliberately rejects
them (that is what used to cause "Downloading Python…" / Time Limit Exceeded).
Install real Python from python.org with *Add python.exe to PATH* ticked.

### Local runner (zero setup)

With `CODE_EXEC_PROVIDER=auto` or `local`, code is compiled and run on the
backend machine using the toolchains it already has (`python3`, `gcc`, `g++`,
`javac`/`java`). Each run gets a throwaway temp directory, a minimal
environment, a hard wall-clock timeout and a SIGKILL of the whole process
group. This is convenient for college labs and local demos, but it is *not*
a container — prefer self-hosted Piston for a public deployment.

## 3. Authoring a problem

In the Admin Portal → quiz → Add question → **Programming**:

- question text + detailed problem statement, input/output format, constraints
- sample input/output (visible to students, used by **Run**)
- test cases (hidden by default, used by **Submit** for grading)
- marks, negative marks, execution time limit, allowed languages

## 4. Grading rules

- Marks are awarded in proportion to hidden test cases passed
  (`marks x passed / total`), rounded to 2 decimals.
- Zero test cases passed → the question's **negative marks** are deducted.
- Compilation errors, runtime errors and time-limit breaches count as failed
  test cases, not as errors for the student.
- Submissions that print the expected answers without reading stdin are
  rejected as hardcoded and score zero (negative marks apply).
- If the student never presses Submit, their last saved code is judged
  automatically when the attempt is finalised.

## Java (and other languages) showing "judge_unavailable"

The public Piston endpoint became whitelist-only (HTTP 401) in Feb 2026, so the
remote fallback no longer works out of the box. Use one of these:

1. **Install the toolchains on the server that runs the backend** (recommended):
   - Python: `python3`
   - C / C++: `gcc`, `g++`
   - Java: a **JDK** (`javac` + `java`), not just a JRE — e.g. `sudo apt install default-jdk`
     (Windows: install Temurin/Oracle JDK, then set `JAVA_HOME`).
     `javac` does not need to be on PATH: the judge also looks at `JAVA_HOME`/`JDK_HOME`
     and scans `/usr/lib/jvm`, `/Library/Java/JavaVirtualMachines` and
     `C:\Program Files\Java`. You can pin it with `JAVAC_BIN` / `JAVA_BIN`.
     Student code may declare any class name (`public class Solution`) or a
     package — the judge writes the file under the matching name/folder and
     runs the class that owns `main`.
   Then keep `CODE_EXEC_PROVIDER=auto` (default). C, C++ and Python already work
   on any machine with build tools installed.
2. **Host your own Piston instance** and point the backend at it:
   ```
   CODE_EXEC_PROVIDER=remote
   CODE_EXEC_URL=https://your-piston-host/api/v2/execute
   ```

---

## Pre-installed runtimes (required)

The server **never installs or downloads a runtime while a student runs code**.
All four toolchains are discovered once at boot (`warmupRuntimes()` in
`src/utils/localRunner.js`) and the resolved absolute binaries are cached for
the life of the process. A missing runtime returns an immediate, explicit
error instead of stalling with an installer.

Install once on the server:

```bash
# Debian / Ubuntu
sudo apt install -y python3 build-essential default-jdk
```

Windows: install real Python (python.org) and MinGW-w64 + a JDK. The Microsoft
Store "app execution alias" (`…\WindowsApps\python.exe`) is a 0-byte stub that
opens the Store and shows "Downloading…" — the runner detects and skips it.

Verify before opening a quiz:

```bash
cd backend && node scripts/check-runtimes.js
```

Optional pins (used ahead of PATH lookup): `PYTHON_BIN`, `GCC_BIN`, `GPP_BIN`,
`JAVAC_BIN`.

### Timeouts

The question's time limit applies to the **student program only**. Toolchain
discovery (boot, 20 s) and compilation (20 s) are separate budgets, and a
per-language floor (Java 6 s, Python 3 s, C/C++ 2 s) prevents interpreter/JVM
start-up from being reported as "Time Limit Exceeded".

## Zero-setup fallback (C / C++ / Java / Python)

If a language has no local compiler and `CODE_EXEC_URL` is not configured, the
judge now falls back to **Wandbox** (`https://wandbox.org`), a free, key-less,
sandboxed compile service. This is what removes the old
"Judge unavailable / Judge Not Found" screens for C and C++ on machines without
gcc/g++.

Order of execution: local toolchain -> `CODE_EXEC_URL` -> Wandbox.

Env:

| Variable | Default | Meaning |
| --- | --- | --- |
| `CODE_EXEC_FALLBACK` | `wandbox` | set to `off` to disable the public fallback |
| `WANDBOX_URL` | `https://wandbox.org/api/compile.json` | endpoint (self-hostable) |
| `WANDBOX_COMPILERS` | – | pin compilers, e.g. `c=gcc-12.3.0-c,cpp=gcc-12.3.0` |

Installing gcc/g++ locally is still the fastest option; the fallback only keeps
the platform usable when they are missing.

## My Programs (Programming tab)

Saved programs live in the student's browser, grouped in one folder per
language (`.py`, `.java`, `.c`, `.cpp`). Java programs may contain a `Main`
class plus additional classes; every file is sent with the run request and
compiled together (locally with `javac`, or on the fallback sandbox).
