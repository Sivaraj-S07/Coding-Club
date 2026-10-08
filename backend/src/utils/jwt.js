const jwt = require("jsonwebtoken");
const env = require("../config/env");

function signAdminToken(payload) {
  return jwt.sign({ ...payload, role: "admin" }, env.JWT_SECRET, {
    expiresIn: env.JWT_ADMIN_EXPIRES_IN,
  });
}

function signStudentToken(payload) {
  return jwt.sign({ ...payload, role: "student" }, env.JWT_SECRET, {
    expiresIn: env.JWT_STUDENT_EXPIRES_IN,
  });
}

function signMentorToken(payload) {
  return jwt.sign({ ...payload, role: "mentor" }, env.JWT_SECRET, { expiresIn: env.JWT_STUDENT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

module.exports = { signAdminToken, signStudentToken, signMentorToken, verifyToken };
