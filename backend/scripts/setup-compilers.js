#!/usr/bin/env node
/**
 * Guided toolchain setup / diagnosis for the programming judge.
 *
 *   npm run setup:compilers          # report what is missing + exact commands
 *   npm run setup:compilers -- --install   # actually run the package manager
 *
 * NOTHING here ever runs while a student presses Run or Submit — installation
 * is a deliberate, manual operation performed by the server administrator.
 */

const { spawnSync } = require("child_process");
const { warmupRuntimes } = require("../src/utils/localRunner");

const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const DO_INSTALL = process.argv.includes("--install");

function has(bin) {
  const probe = spawnSync(bin, ["--version"], { encoding: "utf8", windowsHide: true });
  return !probe.error;
}

function packageManager() {
  if (IS_WINDOWS) {
    if (has("winget")) return "winget";
    if (has("choco")) return "choco";
    return null;
  }
  if (IS_MAC) return has("brew") ? "brew" : null;
  if (has("apt-get")) return "apt";
  if (has("dnf")) return "dnf";
  if (has("pacman")) return "pacman";
  if (has("apk")) return "apk";
  return null;
}

const COMMANDS = {
  winget: {
    c: ["winget", ["install", "-e", "--id", "MSYS2.MSYS2"]],
    cpp: ["winget", ["install", "-e", "--id", "MSYS2.MSYS2"]],
    python: ["winget", ["install", "-e", "--id", "Python.Python.3.12"]],
    java: ["winget", ["install", "-e", "--id", "EclipseAdoptium.Temurin.21.JDK"]],
  },
  choco: {
    c: ["choco", ["install", "-y", "mingw"]],
    cpp: ["choco", ["install", "-y", "mingw"]],
    python: ["choco", ["install", "-y", "python312"]],
    java: ["choco", ["install", "-y", "temurin21"]],
  },
  apt: {
    c: ["sudo", ["apt-get", "install", "-y", "build-essential"]],
    cpp: ["sudo", ["apt-get", "install", "-y", "build-essential"]],
    python: ["sudo", ["apt-get", "install", "-y", "python3"]],
    java: ["sudo", ["apt-get", "install", "-y", "default-jdk"]],
  },
  dnf: {
    c: ["sudo", ["dnf", "install", "-y", "gcc"]],
    cpp: ["sudo", ["dnf", "install", "-y", "gcc-c++"]],
    python: ["sudo", ["dnf", "install", "-y", "python3"]],
    java: ["sudo", ["dnf", "install", "-y", "java-21-openjdk-devel"]],
  },
  pacman: {
    c: ["sudo", ["pacman", "-S", "--noconfirm", "gcc"]],
    cpp: ["sudo", ["pacman", "-S", "--noconfirm", "gcc"]],
    python: ["sudo", ["pacman", "-S", "--noconfirm", "python"]],
    java: ["sudo", ["pacman", "-S", "--noconfirm", "jdk-openjdk"]],
  },
  apk: {
    c: ["sudo", ["apk", "add", "gcc", "musl-dev"]],
    cpp: ["sudo", ["apk", "add", "g++", "musl-dev"]],
    python: ["sudo", ["apk", "add", "python3"]],
    java: ["sudo", ["apk", "add", "openjdk21"]],
  },
  brew: {
    c: ["brew", ["install", "gcc"]],
    cpp: ["brew", ["install", "gcc"]],
    python: ["brew", ["install", "python"]],
    java: ["brew", ["install", "openjdk"]],
  },
};

const MANUAL = {
  c: "MSYS2: pacman -S mingw-w64-ucrt-x86_64-gcc, then add C:\\msys64\\ucrt64\\bin to PATH (or set GCC_BIN)",
  cpp: "MSYS2: pacman -S mingw-w64-ucrt-x86_64-gcc, then add C:\\msys64\\ucrt64\\bin to PATH (or set GPP_BIN)",
  python: "Install from https://www.python.org/downloads/ with \"Add python.exe to PATH\" ticked. Do NOT rely on the Microsoft Store alias — it is an installer stub and is rejected by the judge.",
  java: "Install Temurin JDK 21 from https://adoptium.net and set JAVA_HOME",
};

async function main() {
  console.log("Checking pre-installed runtimes…\n");
  const report = await warmupRuntimes({ log: false });
  const missing = [];
  for (const [language, info] of Object.entries(report)) {
    if (info.available) console.log(`  ✔ ${language.padEnd(7)} ${info.version}\n    ${info.bin}`);
    else {
      console.log(`  x ${language.padEnd(7)} NOT INSTALLED`);
      missing.push(language);
    }
  }

  if (!missing.length) {
    console.log("\nAll four languages (C, C++, Java, Python) are ready. Nothing to do.");
    return;
  }

  const pm = packageManager();
  console.log(`\nMissing: ${missing.join(", ")}`);
  if (!pm) {
    console.log("\nNo supported package manager detected. Install manually:");
    for (const language of missing) console.log(`  - ${language}: ${MANUAL[language]}`);
    return;
  }

  console.log(`\nDetected package manager: ${pm}\n`);
  for (const language of missing) {
    const entry = COMMANDS[pm][language];
    if (!entry) continue;
    const [cmd, args] = entry;
    const printable = `${cmd} ${args.join(" ")}`;
    if (!DO_INSTALL) {
      console.log(`  ${language.padEnd(7)} ${printable}`);
      continue;
    }
    console.log(`\n$ ${printable}`);
    const res = spawnSync(cmd, args, { stdio: "inherit", windowsHide: true });
    if (res.status !== 0) console.log(`  (failed — run it manually: ${printable})`);
  }

  if (!DO_INSTALL) {
    console.log("\nRe-run with --install to execute these commands:");
    console.log("  npm run setup:compilers -- --install");
  } else {
    console.log("\nRestart the backend so the judge re-discovers the toolchains, then verify:");
    console.log("  npm run check:runtimes");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
