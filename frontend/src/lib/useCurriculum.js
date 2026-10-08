import { useEffect, useState } from "react";
import { aiApi } from "./aiApi";

// The curriculum (lessons only) never changes during a session, so fetch once.
let cache = null;
let inflight = null;

export function topicText(topic, field, lang) {
  const v = topic?.[field];
  if (!v) return "";
  return v[lang] || v.en || "";
}

export function useCurriculum(token) {
  const [topics, setTopics] = useState(cache);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cache || !token) return undefined;
    let alive = true;
    inflight = inflight || aiApi(token).curriculum().then((d) => (cache = d.topics)).finally(() => (inflight = null));
    inflight
      .then((t) => alive && setTopics(t))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [token]);

  return { topics, error, byId: (id) => (topics || []).find((t) => t.id === id) || null };
}

export function clearCurriculumCache() {
  cache = null;
}
