import { useState } from 'react';
import { Activity, Award, BookOpen, Check, Code2, Crown, Flame, ListChecks, Medal, Rocket, Star, Target, Trophy, Users, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import Button from './ui/Button';

// Presentational components for Team Search and the Team workspace.
// All data comes pre-computed from /api/teams/search and /api/teams/:id/insights.
const ICONS = { flame: Flame, star: Star, trophy: Trophy, rocket: Rocket, check: Check, award: Award, target: Target, code: Code2, book: BookOpen, users: Users };
const shortDate = v => (v ? new Date(v).toLocaleDateString() : '');
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function Meter({ label, value, hint }) {
  const v = Math.max(0, Math.min(100, Math.round(num(value))));
  return <div className="ti-meter">
    <div className="ti-meter-head"><span>{label}</span><strong>{v}%</strong></div>
    <div className="ti-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}><span style={{ width: `${v}%` }} /></div>
    {hint && <p className="ti-hint">{hint}</p>}
  </div>;
}

function Stat({ label, value }) {
  return <div className="ti-stat"><p>{label}</p><strong>{value}</strong></div>;
}

export function Skills({ skills = [], empty = 'No skills demonstrated yet.' }) {
  if (!skills.length) return <p className="ti-empty">{empty}</p>;
  return <ul className="ti-chips">{skills.map(s => <li key={`${s.source}-${s.name}`} title={`${s.name} · ${s.level}`}><span>{s.name}</span><em>{s.level}</em></li>)}</ul>;
}

export function Achievements({ items = [], empty = 'No achievements earned yet.' }) {
  if (!items.length) return <p className="ti-empty">{empty}</p>;
  return <ul className="ti-badges">{items.map(a => { const Icon = ICONS[a.icon] || Award; return <li key={a.id} title={a.description}><Icon size={16} aria-hidden="true" /><span>{a.title}</span></li>; })}</ul>;
}

export function Activities({ items = [], empty = 'No recent activity.' }) {
  if (!items.length) return <p className="ti-empty">{empty}</p>;
  return <ul className="ti-activities">{items.map((a, i) => <li key={`${a.type}-${a.at}-${i}`}><Activity size={14} aria-hidden="true" /><span>{a.memberName ? <b>{a.memberName}: </b> : null}{a.label}</span><time>{shortDate(a.at)}</time></li>)}</ul>;
}

function studentStats(p) {
  const s = p.stats || {};
  return [
    ['Completed tasks', `${num(s.completedTasks)}${s.tasksAssigned ? ` / ${num(s.tasksAssigned)}` : ''}`],
    ['XP', num(s.xp)], ['Streak', `${num(s.streakDays)}d`],
    ['Quizzes passed', `${num(s.quizzesPassed)} / ${num(s.quizzesTaken)}`], ['Code runs', num(s.codeRuns)], ['Projects', num(s.projects)]
  ];
}
function mentorStats(p) {
  const s = p.stats || {};
  return [['Teams mentored', num(s.teamsMentoring)], ['Students mentored', num(s.mentees)], ['Tasks assigned', num(s.tasksAssigned)], ['Tasks completed', num(s.tasksDone)], ['Messages', num(s.messagesSent)]];
}

/** One person (student, team leader, member or mentor). `defaultOpen` shows details immediately. */
export function PersonInsight({ person, defaultOpen = false, rank, children }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!person) return null;
  const mentor = person.role === 'mentor';
  const hasInsights = person.stats && person.performance && person.achievements;
  const perf = person.performance;
  return <article className="ti-card">
    <header className="ti-card-head">
      <div className="flex min-w-0 items-center gap-3">
        <span className="team-avatar">{(person.name || person.username || '?').slice(0, 2).toUpperCase()}</span>
        <div className="min-w-0">
          <p className="break-words font-semibold">{person.name || person.username}{rank ? <span className="ti-rank" title={`Rank ${rank} in team`}>#{rank}</span> : null}</p>
          <p className="text-xs text-ink-500">@{person.username}{person.department ? ` · ${person.department}` : ''}</p>
          <p className="ti-role">{person.isLeader || /Leader/.test(person.roleLabel || '') ? <Crown size={12} aria-hidden="true" /> : null}{person.roleLabel || (mentor ? 'Mentor' : 'Student')}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}{hasInsights && <Button variant="ghost" size="sm" icon={open ? ChevronUp : ChevronDown} aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Hide details' : 'View details'}</Button>}</div>
    </header>
    {mentor && person.bio && <p className="mt-3 break-words text-sm text-ink-500">{person.bio}</p>}
    {hasInsights ? <>
      <div className="ti-meters">
        <Meter label={mentor ? 'Mentee progress' : 'Progress'} value={person.progress} />
        <Meter label={mentor ? 'Mentee task completion' : 'Performance'} value={perf.score} hint={perf.label} />
      </div>
      {open && <div className="ti-detail">
        <div className="ti-stats">{(mentor ? mentorStats(person) : studentStats(person)).map(([l, v]) => <Stat key={l} label={l} value={v} />)}</div>
        {!mentor && person.teamTasks && <p className="ti-hint">In this team: {person.teamTasks.done} of {person.teamTasks.assigned} tasks done{person.teamProjects ? ` · ${person.teamProjects} project${person.teamProjects === 1 ? '' : 's'} shared` : ''}</p>}
        <h4>{mentor ? 'Mentoring focus' : 'Skills'}</h4><Skills skills={person.skills} empty={mentor ? 'Appears once mentees build skills.' : undefined} />
        <h4>Achievements ({person.achievements.length})</h4><Achievements items={person.achievements} />
        <h4>{mentor ? 'Recent mentor activity' : 'Dashboard activities'}</h4><Activities items={person.activities} />
        {!!person.teams?.length && <p className="ti-hint">{mentor ? 'Mentors' : 'Member of'}: {person.teams.map(t => t.name).join(', ')}</p>}
      </div>}
    </> : <p className="ti-hint mt-3">Detailed insights are unavailable right now.</p>}
  </article>;
}

export function TopPerformers({ list = [] }) {
  if (!list.length) return <p className="ti-empty">No top performers yet — rankings appear once members complete tasks, quizzes or practice.</p>;
  const medals = ['#f5c542', '#c0c7d1', '#d08a53'];
  return <ol className="ti-podium">{list.map((p, i) => <li key={p.id}>
    <Medal size={20} style={{ color: medals[i] || medals[2] }} aria-hidden="true" />
    <div className="min-w-0"><p className="break-words font-semibold">#{p.rank} {p.name}{p.isLeader ? ' · Leader' : ''}</p><p className="text-xs text-ink-500">Performance {p.performance}% · Progress {p.progress}% · {p.completedTasks} task{p.completedTasks === 1 ? '' : 's'} · {p.achievements} badge{p.achievements === 1 ? '' : 's'}</p></div>
  </li>)}</ol>;
}

export function TeamSummary({ summary }) {
  if (!summary) return null;
  return <div>
    <div className="ti-meters">
      <Meter label="Overall team progress" value={summary.progress} />
      <Meter label="Team performance" value={summary.performance} />
      <Meter label="Task completion" value={summary.completionRate} hint={`${summary.tasksDone} of ${summary.tasksTotal} tasks done`} />
    </div>
    <div className="ti-stats">{[['Members', summary.memberCount], ['Mentors', summary.mentorCount], ['Active (7 days)', summary.activeMembers], ['Total XP', summary.totalXp], ['Projects', summary.projects], ['Badges earned', summary.achievementsEarned]].map(([l, v]) => <Stat key={l} label={l} value={v} />)}</div>
  </div>;
}

function Brief({ person, label }) {
  if (!person) return <p className="ti-empty">{label === 'Mentor' ? 'No mentor has joined yet.' : 'Not available.'}</p>;
  return <div className="ti-brief"><span className="team-avatar">{(person.name || '?').slice(0, 2).toUpperCase()}</span><div className="min-w-0"><p className="break-words font-semibold">{person.name}</p><p className="text-xs text-ink-500">{label} · @{person.username}{person.performance ? ` · ${person.role === 'mentor' ? 'Mentee progress' : 'Performance'} ${person.role === 'mentor' ? person.progress : person.performance.score}%` : ''}{person.achievementCount != null ? ` · ${person.achievementCount} badges` : ''}</p></div></div>;
}

/** Compact team result for Team Search. `children` receive the expanded full roster. */
export function TeamSearchSummary({ team, expanded, loading, onToggle, children }) {
  return <div className="ti-team">
    <div className="ti-two">
      <div><h4>Team Leader</h4><Brief person={team.leader} label="Team Leader" /></div>
      <div><h4>Mentor{team.mentors?.length === 1 ? '' : 's'}</h4>{team.mentors?.length ? team.mentors.map(m => <Brief key={m.id} person={m} label="Mentor" />) : <p className="ti-empty">No mentor has joined yet.</p>}</div>
    </div>
    {team.summary ? <><TeamSummary summary={team.summary} /><h4><TrendingUp size={14} className="mr-1 inline" aria-hidden="true" />Top performers</h4><TopPerformers list={team.topPerformers} /></> : <p className="ti-hint">Team insights are unavailable right now.</p>}
    {team.summary && <Button variant="secondary" size="sm" icon={expanded ? ChevronUp : ListChecks} aria-expanded={expanded} disabled={loading} onClick={onToggle}>{loading ? 'Loading…' : expanded ? 'Hide member details' : 'View every member’s activity & progress'}</Button>}
    {expanded && children}
  </div>;
}

/** Full team workspace panel: leader, mentors, every member, top performers and team progress. */
export function TeamInsightsPanel({ data }) {
  return <div className="ti-panel">
    <section><h3 className="ti-title">Overall team progress</h3><TeamSummary summary={data.summary} /></section>
    <section><h3 className="ti-title"><Trophy size={16} className="mr-1 inline" aria-hidden="true" />Top performers</h3><TopPerformers list={data.topPerformers} /></section>
    <section><h3 className="ti-title">Team Leader</h3>{data.leader ? <PersonInsight person={data.leader} rank={data.leader.rank} /> : <p className="ti-empty">Leader not available.</p>}</section>
    <section><h3 className="ti-title">Mentor{data.mentors.length === 1 ? '' : 's'}</h3>{data.mentors.length ? data.mentors.map(m => <PersonInsight key={m.id} person={m}>{m.teamStats && <span className="ti-hint">In this team: {m.teamStats.tasksAssigned} tasks assigned · {m.teamStats.messages} messages</span>}</PersonInsight>) : <p className="ti-empty">No mentor has joined yet.</p>}</section>
    <section><h3 className="ti-title">All members ({data.members.length})</h3>{data.members.filter(m => !m.isLeader).length === 0 ? <p className="ti-empty">The leader is the only member so far.</p> : data.members.filter(m => !m.isLeader).map(m => <PersonInsight key={m.id} person={m} rank={m.rank} />)}</section>
    <section><h3 className="ti-title">Recent team activity</h3><Activities items={data.recentActivity} empty="No recent member activity." /></section>
  </div>;
}
