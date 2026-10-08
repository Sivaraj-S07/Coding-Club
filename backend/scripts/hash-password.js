#!/usr/bin/env node
/**
 * Usage: npm run hash-password -- "yourNewPassword"
 * Prints a bcrypt hash to put in backend/.env as ADMIN_PASSWORD_HASH.
 */
const bcrypt = require("bcryptjs");

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run hash-password -- "yourNewPassword"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log("\nAdd this to backend/.env:\n");
console.log(`ADMIN_PASSWORD_HASH=${hash}\n`);
