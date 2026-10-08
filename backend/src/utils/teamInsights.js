/**
 * Team insights — read-only analytics for Team Search and the Team workspace.
 *
 * Everything here is DERIVED from tables that already exist (learning_profiles,
 * topic_mastery, quiz_attempts, adaptive_sessions, playground_runs, team_tasks,
 * team_projects, team_messages, team_members, team_mentors). Nothing is written
 * and no migration is required, so existing features cannot be affected.
 *
 * Privacy: only aggregates and short labels leave this module. It never returns
 * e-mail, mobile number, register number, password data, source code, program
 * output, per-quiz marks, task titles, project titles/URLs or chat messages.
 *
 * Bulk loading: each public loader issues ONE query per table for ALL people it
 * is given (never one query per person), and every query is capped at ROW_CAP
 * most-recent rows, so a search page costs a fixed number of round-trips.
 */
const { ApiError } = require('./asyncHandler');
const { TOPICS } = require('../data/curriculum');

const ROW_CAP = 1000;
const DAY = 86400000;
const MISSING_TABLE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const LANGUAGE_NAMES = { c: 'C', cpp: 'C++', java: 'Java', python: 'Python' };
const topicTitle = id => TOPICS.find(t => t.id === id)?.title?.en || String(id || 'Topic').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase());
const clamp = n => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const avg = list => list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
const uniq = list => [...new Set(list.filter(Boolean))];
const time = v => { const t = Date.parse(v || ''); return Number.isFinite(t) ? t : 0; };

/**
 * Read a query. `soft` tables (learning analytics that older databases may not
 * have yet) degrade to "no data"; team tables surface the actionable 503.
 */
async function read(query, { soft = false } = {}) {
  const { data, error } = await query;
  if (!error) return data || [];
  if (MISSING_TABLE.has(error.code)) {
    if (soft) return [];
    throw new ApiError(503, 'Team features need the migration_teams_mentors.sql database update.');
  }
  throw new ApiError(500, 'Unable to load team data');
}
const inList = (db, table, cols, column, ids, { soft = false, order } = {}) => {
  if (!ids.length) return Promise.resolve([]);
  let q = db.from(table).select(cols).in(column, ids);
  if (order) q = q.order(order, { ascending: false });
  return read(q.limit(ROW_CAP), { soft });
};
const group = (rows, key) => { const m = new Map(); for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; };

// ---------------------------------------------------------------------------
// Pure derivations
// ---------------------------------------------------------------------------
const levelOfMastery = m => (m >= 0.8 ? 'Advanced' : m >= 0.6 ? 'Intermediate' : 'Beginner');
const levelOfRuns = n => (n >= 15 ? 'Advanced' : n >= 5 ? 'Intermediate' : 'Beginner');

function deriveSkills({ mastery, runs }) {
  const skills = [];
  for (const m of mastery) {
    if (num(m.attempts) < 1 || num(m.mastery) < 0.4) continue;
    skills.push({ name: topicTitle(m.topic_id), level: levelOfMastery(num(m.mastery)), score: clamp(num(m.mastery) * 100), source: 'topic' });
  }
  const byLang = new Map();
  for (const r of runs) if (r.status === 'ok') byLang.set(r.language, (byLang.get(r.language) || 0) + 1);
  for (const [lang, count] of byLang) skills.push({ name: LANGUAGE_NAMES[lang] || String(lang).toUpperCase(), level: levelOfRuns(count), score: clamp(count * 5), source: 'language' });
  return skills.sort((a, b) => b.score - a.score).slice(0, 10);
}

const BADGES = [
  ['first_steps', 'First Steps', 'Started learning on Eduverse', 'rocket', s => s.hasActivity],
  ['streak_3', 'On a Roll', '3-day learning streak', 'flame', s => s.streakDays >= 3],
  ['streak_7', 'Unstoppable', '7-day learning streak', 'flame', s => s.streakDays >= 7],
  ['xp_100', 'Rising Learner', 'Earned 100 XP', 'star', s => s.xp >= 100],
  ['xp_500', 'XP Hunter', 'Earned 500 XP', 'star', s => s.xp >= 500],
  ['xp_1000', 'XP Legend', 'Earned 1,000 XP', 'trophy', s => s.xp >= 1000],
  ['quiz_passer', 'Quiz Passer', 'Passed a quiz', 'check', s => s.quizzesPassed >= 1],
  ['quiz_regular', 'Quiz Regular', 'Completed 5 quizzes', 'book', s => s.quizzesTaken >= 5],
  ['quiz_ace', 'Quiz Ace', 'Scored 90% or more on a quiz', 'award', s => s.bestQuizPercent >= 90],
  ['topic_master', 'Topic Master', 'Reached 80% mastery in a topic', 'target', s => s.topicsMastered >= 1],
  ['all_rounder', 'All-Rounder', 'Reached 60% mastery in 3 topics', 'target', s => s.topicsProficient >= 3],
  ['coder', 'Hands-on Coder', '10 successful code runs', 'code', s => s.codeRunsOk >= 10],
  ['polyglot', 'Polyglot Coder', 'Ran code in 3 languages', 'code', s => s.languages >= 3],
  ['task_finisher', 'Task Finisher', 'Completed a team task', 'check', s => s.tasksDone >= 1],
  ['task_champion', 'Task Champion', 'Completed 5 team tasks', 'trophy', s => s.tasksDone >= 5],
  ['perfect_delivery', 'Perfect Delivery', 'Finished every assigned task (3+)', 'award', s => s.tasksAssigned >= 3 && s.tasksDone === s.tasksAssigned],
  ['builder', 'Project Builder', 'Shared a project with a team', 'rocket', s => s.projects >= 1],
  ['showcase', 'Showcase', 'Shared 3 projects', 'trophy', s => s.projects >= 3],
  ['team_leader', 'Team Leader', 'Created and leads a team', 'users', s => s.ledTeams >= 1]
];
const deriveAchievements = stats => BADGES.filter(b => b[4](stats)).map(([id, title, description, icon]) => ({ id, title, description, icon }));

function scoreStudent(s) {
  const components = [s.curriculumProgress, s.avgQuizPercent, s.taskCompletion].filter(v => v !== null);
  const progress = clamp(avg(components) ?? 0);
  const parts = [[s.avgQuizPercent, 0.35], [s.practiceAccuracy, 0.2], [s.taskCompletion, 0.3], [Math.min(100, s.xp / 10 + s.streakDays * 5), 0.15]].filter(([v]) => v !== null);
  const weight = parts.reduce((a, [, w]) => a + w, 0);
  const performance = s.hasActivity && weight ? clamp(parts.reduce((a, [v, w]) => a + v * w, 0) / weight) : 0;
  const label = !s.hasActivity ? 'No activity yet' : performance >= 85 ? 'Outstanding' : performance >= 70 ? 'Strong' : performance >= 50 ? 'Steady' : performance >= 25 ? 'Developing' : 'Getting started';
  return { progress, performance: { score: performance, label } };
}

const quizLabel = a => `Completed quiz “${String(a.quizzes?.title || 'Quiz').slice(0, 80)}”${a.percentage == null ? '' : ` — ${Math.round(num(a.percentage))}%`}`;
function deriveActivities({ attempts, sessions, runs }) {
  const feed = [];
  for (const a of attempts) if (['submitted', 'auto_submitted'].includes(a.status)) feed.push({ type: 'quiz', label: quizLabel(a), at: a.submitted_at });
  for (const s of sessions) if (s.status === 'completed') feed.push({ type: 'practice', label: `Adaptive practice: ${topicTitle(s.topic_id)} — ${num(s.correct_count)}/${num(s.answered_count)} correct`, at: s.started_at });
  for (const r of runs.slice(0, 20)) feed.push({ type: 'code', label: `Ran ${LANGUAGE_NAMES[r.language] || String(r.language).toUpperCase()} code${r.status === 'ok' ? '' : ' (needs fixing)'}`, at: r.created_at });
  return feed.filter(f => f.at).sort((a, b) => time(b.at) - time(a.at)).slice(0, 6);
}

function buildStudentInsight(person, data) {
  const profile = data.profiles.get(person.id)?.[0] || {};
  const mastery = data.mastery.get(person.id) || [], attempts = data.attempts.get(person.id) || [], sessions = data.sessions.get(person.id) || [];
  const runs = data.runs.get(person.id) || [], tasks = data.tasks.get(person.id) || [], projects = data.projects.get(person.id) || [];
  const led = data.led.get(person.id) || 0, teams = data.teams.get(person.id) || [];
  const done = attempts.filter(a => ['submitted', 'auto_submitted'].includes(a.status));
  const percents = done.map(a => a.percentage).filter(p => p !== null && p !== undefined && Number.isFinite(Number(p))).map(Number);
  const attemptsTotal = mastery.reduce((a, m) => a + num(m.attempts), 0), correctTotal = mastery.reduce((a, m) => a + num(m.correct), 0);
  const tasksDone = tasks.filter(t => t.status === 'done').length;
  const okRuns = runs.filter(r => r.status === 'ok');
  const raw = {
    xp: num(profile.xp), streakDays: num(profile.streak_days), practiceAnswers: num(profile.total_practice_answers),
    quizzesTaken: done.length, quizzesPassed: done.filter(a => a.passed).length, bestQuizPercent: percents.length ? Math.max(...percents) : 0,
    avgQuizPercent: percents.length ? clamp(avg(percents)) : null,
    topicsPracticed: mastery.filter(m => num(m.attempts) > 0).length, topicsMastered: mastery.filter(m => num(m.mastery) >= 0.8 && num(m.attempts) >= 5).length,
    topicsProficient: mastery.filter(m => num(m.mastery) >= 0.6 && num(m.attempts) >= 3).length,
    curriculumProgress: clamp(mastery.reduce((a, m) => a + num(m.mastery), 0) / Math.max(1, TOPICS.length) * 100),
    practiceAccuracy: attemptsTotal ? clamp(correctTotal / attemptsTotal * 100) : null,
    adaptiveSessions: sessions.filter(s => s.status === 'completed').length,
    codeRuns: runs.length, codeRunsOk: okRuns.length, languages: uniq(okRuns.map(r => r.language)).length,
    tasksAssigned: tasks.length, tasksDone, tasksInProgress: tasks.filter(t => t.status === 'in_progress').length, tasksTodo: tasks.filter(t => t.status === 'todo').length,
    taskCompletion: tasks.length ? clamp(tasksDone / tasks.length * 100) : null,
    projects: projects.length, ledTeams: led, teamCount: teams.length
  };
  raw.hasActivity = raw.xp > 0 || raw.quizzesTaken > 0 || raw.codeRuns > 0 || raw.adaptiveSessions > 0 || raw.practiceAnswers > 0 || raw.tasksAssigned > 0 || raw.projects > 0;
  const { progress, performance } = scoreStudent(raw);
  const lastActive = Math.max(time(profile.last_active_date), ...done.map(a => time(a.submitted_at)), ...runs.slice(0, 5).map(r => time(r.created_at)), ...sessions.slice(0, 5).map(s => time(s.started_at)), 0);
  const { hasActivity, ledTeams, ...stats } = raw; // keep the public stats object flat and free of internals
  return {
    id: person.id, name: person.name, username: person.username, department: person.department || '', role: 'student',
    roleLabel: led ? 'Student · Team Leader' : 'Student',
    stats: { ...stats, teamsLed: led, completedTasks: tasksDone, activeLast7Days: lastActive > Date.now() - 7 * DAY },
    progress, performance, skills: deriveSkills({ mastery, runs }), achievements: deriveAchievements({ ...raw, hasActivity, ledTeams }),
    activities: deriveActivities({ attempts, sessions, runs }), teams: teams.slice(0, 5), lastActiveAt: lastActive ? new Date(lastActive).toISOString() : null
  };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------
/** Insights for students ({id,name,username,department}). Returns Map(id -> insight). */
async function loadStudentInsights(db, people) {
  const ids = uniq(people.map(p => p.id));
  if (!ids.length) return new Map();
  const [profiles, mastery, attempts, sessions, runs, tasks, projects, memberships] = await Promise.all([
    inList(db, 'learning_profiles', 'student_id,xp,streak_days,total_practice_answers,last_active_date', 'student_id', ids, { soft: true }),
    inList(db, 'topic_mastery', 'student_id,topic_id,mastery,attempts,correct,last_practiced_at', 'student_id', ids, { soft: true }),
    inList(db, 'quiz_attempts', 'student_id,status,percentage,passed,submitted_at,quizzes(title)', 'student_id', ids, { soft: true, order: 'submitted_at' }),
    inList(db, 'adaptive_sessions', 'student_id,topic_id,status,answered_count,correct_count,started_at', 'student_id', ids, { soft: true, order: 'started_at' }),
    inList(db, 'playground_runs', 'student_id,language,status,created_at', 'student_id', ids, { soft: true, order: 'created_at' }),
    inList(db, 'team_tasks', 'assignee_id,status,team_id', 'assignee_id', ids),
    inList(db, 'team_projects', 'student_id,team_id', 'student_id', ids),
    inList(db, 'team_members', 'team_id,student_id', 'student_id', ids)
  ]);
  const teamIds = uniq(memberships.map(m => m.team_id));
  const teamRows = await inList(db, 'teams', 'id,name,owner_id', 'id', teamIds);
  const teamById = new Map(teamRows.map(t => [t.id, t]));
  const teams = new Map(), led = new Map();
  for (const m of memberships) {
    const t = teamById.get(m.team_id); if (!t) continue;
    if (!teams.has(m.student_id)) teams.set(m.student_id, []);
    teams.get(m.student_id).push({ id: t.id, name: t.name, isLeader: t.owner_id === m.student_id });
    if (t.owner_id === m.student_id) led.set(m.student_id, (led.get(m.student_id) || 0) + 1);
  }
  const data = {
    profiles: group(profiles, 'student_id'), mastery: group(mastery, 'student_id'), attempts: group(attempts, 'student_id'), sessions: group(sessions, 'student_id'),
    runs: group(runs, 'student_id'), tasks: group(tasks, 'assignee_id'), projects: group(projects, 'student_id'), teams, led
  };
  return new Map(people.map(p => [p.id, buildStudentInsight(p, data)]));
}

const BY_MENTOR_BADGES = [
  ['first_mentee', 'First Mentee', 'Mentoring a team of students', 'users', s => s.mentees >= 1],
  ['guide', 'Guide', 'Mentoring 3 or more students', 'award', s => s.mentees >= 3],
  ['multi_team', 'Multi-team Mentor', 'Mentoring 2 or more teams', 'trophy', s => s.teamsMentoring >= 2],
  ['task_setter', 'Task Setter', 'Assigned 5 or more tasks', 'check', s => s.tasksAssigned >= 5],
  ['motivator', 'Motivator', 'Posted 10 or more team messages', 'star', s => s.messagesSent >= 10],
  ['impact', 'High Impact', 'Mentees finished 70%+ of 5+ assigned tasks', 'target', s => s.tasksAssigned >= 5 && s.completionRate >= 70]
];

/** Insights for mentors ({id,name,username,bio}). Optional `studentInsights` avoids reloading mentees. */
async function loadMentorInsights(db, mentors, { studentInsights = new Map() } = {}) {
  const ids = uniq(mentors.map(m => m.id));
  if (!ids.length) return new Map();
  const [links, tasks, messages] = await Promise.all([
    inList(db, 'team_mentors', 'team_id,mentor_id', 'mentor_id', ids),
    inList(db, 'team_tasks', 'team_id,mentor_id,assignee_id,status,created_at', 'mentor_id', ids, { order: 'created_at' }),
    inList(db, 'team_messages', 'team_id,mentor_id,created_at', 'mentor_id', ids, { order: 'created_at' })
  ]);
  const teamIds = uniq(links.map(l => l.team_id));
  const memberships = await inList(db, 'team_members', 'team_id,student_id', 'team_id', teamIds);
  const teamRows = await inList(db, 'teams', 'id,name', 'id', teamIds);
  const teamName = new Map(teamRows.map(t => [t.id, t.name]));
  const menteesOf = new Map(); // mentor -> Set(student ids)
  for (const l of links) { const set = menteesOf.get(l.mentor_id) || new Set(); for (const m of memberships) if (m.team_id === l.team_id) set.add(m.student_id); menteesOf.set(l.mentor_id, set); }
  const need = uniq([...menteesOf.values()].flatMap(s => [...s])).filter(id => !studentInsights.has(id)).slice(0, 200);
  let extra = new Map();
  if (need.length) {
    const rows = await inList(db, 'students', 'id,name,username,department', 'id', need);
    extra = await loadStudentInsights(db, rows);
  }
  const insightOf = id => studentInsights.get(id) || extra.get(id);
  const tasksBy = group(tasks, 'mentor_id'), messagesBy = group(messages, 'mentor_id'), linksBy = group(links, 'mentor_id');
  return new Map(mentors.map(m => {
    const myLinks = linksBy.get(m.id) || [];
    const myTasks = tasksBy.get(m.id) || [], myMessages = messagesBy.get(m.id) || [];
    const mentees = [...(menteesOf.get(m.id) || [])].map(insightOf).filter(Boolean);
    const tasksDone = myTasks.filter(t => t.status === 'done').length;
    const skillCount = new Map();
    for (const s of mentees.flatMap(x => x.skills)) if (s.level !== 'Beginner') skillCount.set(s.name, (skillCount.get(s.name) || 0) + 1);
    const stats = {
      teamsMentoring: myLinks.length, mentees: (menteesOf.get(m.id) || new Set()).size, tasksAssigned: myTasks.length, tasksDone, completedTasks: tasksDone,
      completionRate: myTasks.length ? clamp(tasksDone / myTasks.length * 100) : 0, messagesSent: myMessages.length, menteeProgress: mentees.length ? clamp(avg(mentees.map(x => x.progress))) : 0
    };
    const activities = [
      ...myTasks.map(t => ({ type: 'task', label: 'Assigned a task to a team member', at: t.created_at })),
      ...myMessages.map(x => ({ type: 'chat', label: 'Posted in team chat', at: x.created_at }))
    ].filter(a => a.at).sort((a, b) => time(b.at) - time(a.at)).slice(0, 6);
    return [m.id, {
      id: m.id, name: m.name, username: m.username, bio: m.bio || '', role: 'mentor', roleLabel: 'Mentor', stats,
      progress: stats.menteeProgress, performance: { score: stats.completionRate, label: stats.tasksAssigned ? 'Mentee task completion' : 'No tasks assigned yet' },
      skills: [...skillCount].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, n]) => ({ name, level: 'Mentoring focus', score: clamp(n / Math.max(1, mentees.length) * 100), source: 'mentoring' })),
      achievements: BY_MENTOR_BADGES.filter(b => b[4](stats)).map(([bid, title, description, icon]) => ({ id: bid, title, description, icon })),
      activities, teams: myLinks.slice(0, 5).map(l => ({ id: l.team_id, name: teamName.get(l.team_id) || 'Team' }))
    }];
  }));
}

const rankKey = m => m.performance.score * 1e6 + m.progress * 1e3 + m.stats.xp / 1e3;
const podium = members => members.filter(m => m.stats.completedTasks || m.performance.score > 0).slice(0, 3)
  .map(m => ({ id: m.id, name: m.name, username: m.username, rank: m.rank, performance: m.performance.score, progress: m.progress, completedTasks: m.stats.completedTasks, achievements: m.achievements.length, isLeader: m.isLeader }));

/**
 * Full roll-up for teams ({id,name,description,owner_id,created_at}).
 * Returns Map(teamId -> { team, leader, mentors, members, summary, topPerformers, recentActivity }).
 */
async function loadTeamInsights(db, teams, { memberCap = 100 } = {}) {
  const tids = uniq(teams.map(t => t.id));
  if (!tids.length) return new Map();
  const [memberRows, mentorLinks, teamTasks, teamProjects, teamMessages] = await Promise.all([
    inList(db, 'team_members', 'team_id,student_id,joined_at', 'team_id', tids),
    inList(db, 'team_mentors', 'team_id,mentor_id', 'team_id', tids),
    inList(db, 'team_tasks', 'team_id,mentor_id,assignee_id,status', 'team_id', tids),
    inList(db, 'team_projects', 'team_id,student_id', 'team_id', tids),
    inList(db, 'team_messages', 'team_id,mentor_id', 'team_id', tids)
  ]);
  const studentIds = uniq([...memberRows.map(m => m.student_id), ...teams.map(t => t.owner_id)]);
  const mentorIds = uniq(mentorLinks.map(m => m.mentor_id));
  const [students, mentorRows] = await Promise.all([
    inList(db, 'students', 'id,name,username,department', 'id', studentIds),
    inList(db, 'mentors', 'id,name,username,bio', 'id', mentorIds)
  ]);
  const studentInsights = await loadStudentInsights(db, students);
  const mentorInsights = await loadMentorInsights(db, mentorRows, { studentInsights });
  const membersBy = group(memberRows, 'team_id'), mentorsBy = group(mentorLinks, 'team_id'), tasksBy = group(teamTasks, 'team_id'), projectsBy = group(teamProjects, 'team_id'), messagesBy = group(teamMessages, 'team_id');
  const out = new Map();
  for (const team of teams) {
    const ids = uniq([team.owner_id, ...(membersBy.get(team.id) || []).map(m => m.student_id)]);
    const tasks = tasksBy.get(team.id) || [], projects = projectsBy.get(team.id) || [];
    const members = ids.map(sid => studentInsights.get(sid)).filter(Boolean).map(base => {
      const mine = tasks.filter(t => t.assignee_id === base.id);
      return {
        ...base, isLeader: base.id === team.owner_id, roleLabel: base.id === team.owner_id ? 'Team Leader' : 'Team Member',
        teamTasks: { assigned: mine.length, done: mine.filter(t => t.status === 'done').length, inProgress: mine.filter(t => t.status === 'in_progress').length },
        teamProjects: projects.filter(p => p.student_id === base.id).length
      };
    }).sort((a, b) => rankKey(b) - rankKey(a)).map((m, i) => ({ ...m, rank: i + 1 }));
    const leader = members.find(m => m.isLeader) || null;
    const shown = members.slice(0, memberCap);
    const teamMessagesHere = messagesBy.get(team.id) || [];
    const mentors = (mentorsBy.get(team.id) || []).map(l => mentorInsights.get(l.mentor_id)).filter(Boolean).map(m => {
      const mine = tasks.filter(t => t.mentor_id === m.id);
      return { ...m, teamStats: { tasksAssigned: mine.length, tasksDone: mine.filter(t => t.status === 'done').length, messages: teamMessagesHere.filter(x => x.mentor_id === m.id).length } };
    });
    const tasksDone = tasks.filter(t => t.status === 'done').length;
    const summary = {
      memberCount: members.length, mentorCount: mentors.length, progress: members.length ? clamp(avg(members.map(m => m.progress))) : 0,
      performance: members.length ? clamp(avg(members.map(m => m.performance.score))) : 0, tasksTotal: tasks.length, tasksDone,
      completionRate: tasks.length ? clamp(tasksDone / tasks.length * 100) : 0, totalXp: members.reduce((a, m) => a + m.stats.xp, 0),
      activeMembers: members.filter(m => m.stats.activeLast7Days).length, projects: projects.length, achievementsEarned: members.reduce((a, m) => a + m.achievements.length, 0)
    };
    const recentActivity = members.flatMap(m => m.activities.map(a => ({ ...a, memberId: m.id, memberName: m.name }))).sort((a, b) => time(b.at) - time(a.at)).slice(0, 8);
    out.set(team.id, {
      team: { id: team.id, name: team.name, description: team.description || '', createdAt: team.created_at || null },
      leader, mentors, members: shown, summary, topPerformers: podium(members), recentActivity
    });
  }
  return out;
}

module.exports = { loadStudentInsights, loadMentorInsights, loadTeamInsights, deriveSkills, deriveAchievements, scoreStudent, buildStudentInsight, topicTitle };
