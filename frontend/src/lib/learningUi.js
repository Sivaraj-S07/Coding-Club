import { Box, GitBranch, Repeat, Type, List, Braces, BookOpen } from "lucide-react";

const ICONS = { Box, GitBranch, Repeat, Type, List, Braces };
export const iconForTopic = (name) => ICONS[name] || BookOpen;

export const LEVEL_TEXT = { easy: "text-mint", medium: "text-amber", hard: "text-coral" };
export const LEVEL_BG = { easy: "bg-mint", medium: "bg-amber", hard: "bg-coral" };

export function masteryLabelKey(topic) {
  if (!topic || !topic.started) return "learn.notStarted";
  if (topic.mastery >= 0.7) return "learn.strong";
  if (topic.mastery >= 0.4) return "learn.growing";
  return "learn.needsWork";
}

export function masteryBar(topic) {
  if (!topic || !topic.started) return "bg-ink-700";
  if (topic.mastery >= 0.7) return "bg-mint";
  if (topic.mastery >= 0.4) return "bg-amber";
  return "bg-coral";
}

/** Where a recommendation / plan item should take the student. */
export function actionTarget(action) {
  switch (action.type) {
    case "lesson":
      return `/learn/lessons/${action.topicId}`;
    case "practice":
      return action.topicId ? `/learn/practice?topic=${action.topicId}` : "/learn/practice";
    case "tutor":
      return action.topicId ? `/tutor?topic=${action.topicId}` : "/tutor";
    case "playground":
      return "/programming";
    default:
      return "/learn";
  }
}

export const REASON_KEY = {
  weak: "learn.reason.weak",
  next: "learn.reason.next",
  review: "learn.reason.review",
  start: "learn.reason.start",
  "asked-often": "learn.reason.askedOften",
};
