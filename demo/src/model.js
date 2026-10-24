export const projects = ["林间滑索", "山地卡丁车"];
export const labels = {
  pending: "待确认",
  ready: "可交付",
  rendering: "制作中",
  delivered: "已交付",
};
export const imageFor = (project) =>
  project === "山地卡丁车" ? "/media/kart.jpg" : "/media/zipline.jpg";
export const duration = (session) => session.clips.length * 4;
export const clock = (seconds) => `00:${String(seconds).padStart(2, "0")}`;
export const statusOf = (s) =>
  s.delivered
    ? "delivered"
    : !s.verified
      ? "pending"
      : s.renderedVersion !== s.version
        ? "rendering"
        : s.approvedVersion === s.version
          ? "ready"
          : "pending";
export const canApprove = (s) =>
  s.verified && s.clips.length > 0 && s.renderedVersion === s.version;
export const canDeliver = (s) =>
  canApprove(s) && s.approvedVersion === s.version && !s.delivered;
export const canView = (s) =>
  !!s && s.delivered && canApprove(s) && s.approvedVersion === s.version;

function makeSession(id, time, project, party, state) {
  const clips = [
    {
      id: `${id}-1`,
      src: imageFor(project),
      title: "出发，一起迎着风",
      name: "CAM01_001.jpg",
    },
    {
      id: `${id}-2`,
      src: "/media/forest.jpg",
      title: "把快乐留在山林之间",
      name: "CAM02_002.jpg",
    },
    {
      id: `${id}-3`,
      src: imageFor(project),
      title: "这一刻，值得带走",
      name: "CAM01_003.jpg",
    },
  ];
  return {
    id,
    time,
    project,
    party,
    clips,
    version: 1,
    verified: state !== "pending",
    renderedVersion: state === "rendering" ? 0 : 1,
    approvedVersion: state === "ready" ? 1 : 0,
    delivered: false,
    paid: false,
    video:
      project === projects[1] ? "/media/sample-kart.mp4" : "/media/sample.mp4",
  };
}

export function initialSessions() {
  return [
    makeSession(
      "SX-1024-018",
      "14:20",
      projects[0],
      ["林一", "王露"],
      "pending",
    ),
    makeSession("SX-1024-019", "14:25", projects[0], ["陈然", "许宁"], "ready"),
    makeSession(
      "SX-1024-020",
      "14:30",
      projects[0],
      ["李晨", "周悦"],
      "rendering",
    ),
    makeSession(
      "K-1024-027",
      "14:20",
      projects[1],
      ["林一", "王露"],
      "pending",
    ),
    makeSession("K-1024-028", "14:25", projects[1], ["陈然", "许宁"], "ready"),
  ];
}

export function updateSession(s, action) {
  if (s.delivered && action.type !== "purchase") return s;
  switch (action.type) {
    case "verify":
      return { ...s, verified: true };
    case "edit":
      return {
        ...s,
        clips: action.clips,
        version: s.version + 1,
        approvedVersion: 0,
        delivered: false,
        paid: false,
      };
    case "render":
      return action.version === s.version
        ? {
            ...s,
            video: action.video,
            videoFormat: action.format || "webm",
            renderedVersion: s.version,
          }
        : s;
    case "approve":
      return canApprove(s) ? { ...s, approvedVersion: s.version } : s;
    case "deliver":
      return canDeliver(s) ? { ...s, delivered: true } : s;
    case "purchase":
      return canView(s) ? { ...s, paid: true } : s;
    default:
      return s;
  }
}

export function importedSession(id, project, clips) {
  return {
    id,
    project,
    clips,
    time: "14:35",
    party: ["体验者 A", "体验者 B"],
    version: 1,
    verified: false,
    renderedVersion: 0,
    approvedVersion: 0,
    delivered: false,
    paid: false,
    video: "",
  };
}
