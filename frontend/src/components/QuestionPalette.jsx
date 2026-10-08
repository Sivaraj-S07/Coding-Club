// Palette of question buttons. When the quiz has rounds/levels, questions are
// listed separately under their own level heading (Level 1, Level 2, ...) so a
// student always sees which level each question belongs to.
export default function QuestionPalette({ questions, current, answered, onJump, groups }) {
  const stateClasses = (q, idx) => {
    const isCurrent = idx === current;
    const isAnswered = answered.has(q.id);
    if (isCurrent) return "bg-gradient-to-b from-electric-light to-electric text-void shadow-glow";
    if (isAnswered) return "bg-mint/15 text-mint border border-mint/30";
    return "glass text-ink-500 hover:text-ink-100";
  };

  // Fall back to a single flat group when the quiz has no rounds.
  const sections =
    groups && groups.length
      ? groups
      : [{ key: "all", label: "Questions", indices: questions.map((_, i) => i) }];

  const renderButton = (idx, labelNumber) => {
    const q = questions[idx];
    if (!q) return null;
    return (
      <button
        key={q.id}
        onClick={() => onJump(idx)}
        className={`aspect-square rounded-lg text-xs font-semibold transition-all duration-200 ${stateClasses(q, idx)}`}
      >
        {labelNumber}
      </button>
    );
  };

  return (
    <div className="glass-card p-4">
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.key}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-500">
                {section.label}
              </p>
              <span className="shrink-0 text-[11px] text-ink-700">{section.indices.length}</span>
            </div>
            <div className="grid grid-cols-5 gap-2 lg:grid-cols-4">
              {section.indices.map((idx, i) => renderButton(idx, i + 1))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5 text-[11px] text-ink-500">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-mint/40 border border-mint/30" /> Answered ({answered.size})
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm glass" /> Not answered ({questions.length - answered.size})
        </div>
      </div>
    </div>
  );
}
