export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const isForm = body instanceof FormData;
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...rest,
      credentials: "same-origin",
      headers: {
        "X-MomentFlow-Client": "local",
        ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("无法连接本地处理服务，请检查服务是否运行。");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : "本地服务请求失败，请稍后重试。",
    );
  if (!data)
    throw new Error("本地 API 未连接，请从 npm run dev 启动完整应用。");
  return data;
}

export function defaultSelection(segments, limit = 30) {
  const chosen = [];
  let total = 0;
  for (const item of segments) {
    if (chosen.length < 8 && total + item.duration <= limit) {
      chosen.push(item.id);
      total += item.duration;
    }
  }
  return chosen;
}
export const seconds = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
export function latestExport(project, personId) {
  return project?.exports
    .filter((e) => e.person_id === personId && e.current)
    .at(-1);
}

export function initialSelection(project, personId, segments) {
  const person = project.people.find((item) => item.id === personId);
  const output = latestExport(project, personId);
  const story = person?.story;
  const recommended =
    story?.current && story.applied && person.applied_story_id === story.id
      ? story.selected_ids
      : null;
  return (
    output?.segment_ids ||
    recommended ||
    defaultSelection(segments)
  ).filter((id) => segments.some((segment) => segment.id === id));
}
