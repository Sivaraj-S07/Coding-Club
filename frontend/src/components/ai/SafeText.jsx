import { Fragment } from "react";

/**
 * Tiny, SAFE markdown renderer for AI/tutor text: paragraphs, "-" and "1."
 * lists, **bold**, `inline code` and ``` fenced code ```. It builds React
 * elements directly (never dangerouslySetInnerHTML), so model output can't
 * inject HTML or scripts into the page.
 */
function renderInline(text, keyPrefix) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key} className="font-semibold text-ink-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return <code key={key} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em] text-electric-light">{part.slice(1, -1)}</code>;
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function renderBlock(block, index) {
  const lines = block.split("\n");
  const isBullets = lines.every((l) => /^\s*[-*]\s+/.test(l));
  const isNumbers = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
  if (isBullets) {
    return (
      <ul key={index} className="ml-5 list-disc space-y-1">
        {lines.map((l, i) => <li key={i}>{renderInline(l.replace(/^\s*[-*]\s+/, ""), `${index}-${i}`)}</li>)}
      </ul>
    );
  }
  if (isNumbers) {
    return (
      <ol key={index} className="ml-5 list-decimal space-y-1">
        {lines.map((l, i) => <li key={i}>{renderInline(l.replace(/^\s*\d+[.)]\s+/, ""), `${index}-${i}`)}</li>)}
      </ol>
    );
  }
  return (
    <p key={index}>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {renderInline(l, `${index}-${i}`)}
        </Fragment>
      ))}
    </p>
  );
}

export function CodeBlock({ code, language }) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-3 text-left font-mono text-[13px] leading-6 text-ink-100">
      {language && <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-500">{language}</span>}
      <code>{code}</code>
    </pre>
  );
}

export default function SafeText({ text, className = "" }) {
  const source = String(text || "");
  const segments = [];
  const fence = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = fence.exec(source))) {
    if (match.index > last) segments.push({ type: "text", value: source.slice(last, match.index) });
    segments.push({ type: "code", language: match[1], value: match[2].replace(/\n$/, "") });
    last = fence.lastIndex;
  }
  if (last < source.length) segments.push({ type: "text", value: source.slice(last) });

  return (
    <div className={`space-y-3 text-sm leading-relaxed text-ink-300 ${className}`}>
      {segments.map((seg, i) =>
        seg.type === "code" ? (
          <CodeBlock key={i} code={seg.value} language={seg.language} />
        ) : (
          seg.value
            .split(/\n{2,}/)
            .map((b) => b.trim())
            .filter(Boolean)
            .map((b, j) => renderBlock(b, `${i}-${j}`))
        )
      )}
    </div>
  );
}
