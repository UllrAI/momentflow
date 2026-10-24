import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Download, Film, Play, Volume2 } from "lucide-react";
import { t } from "./i18n";
import { seconds } from "./api";

export function ExampleGallery({ locale, start }) {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(false);
  const [activityId, setActivityId] = useState("classroom");
  const [personId, setPersonId] = useState(null);
  const [view, setView] = useState("film");
  const [playing, setPlaying] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const video = useRef(null);
  function load() {
    setError(false);
    fetch("/examples/catalog.json")
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then(setCatalog)
      .catch(() => setError(true));
  }
  useEffect(load, []);
  const activity = catalog?.find((item) => item.id === activityId);
  const person =
    activity?.people.find((item) => item.id === personId) ||
    activity?.people[0];
  const version = person?.versions[locale] || person?.versions.zh;
  const text = (value) =>
    typeof value === "string" ? value : value?.[locale] || value?.zh;
  useEffect(() => setMediaError(false), [activityId, person?.id, view, locale]);
  if (!catalog)
    return (
      <section className="example-loading" role="status">
        <Film size={28} />
        <p>{error ? t("示例暂时无法加载") : t("正在准备故事示例")}</p>
        {error && <button onClick={load}>{t("重试")}</button>}
      </section>
    );
  function selectActivity(id) {
    setActivityId(id);
    setPersonId(null);
    setView("film");
    setPlaying(false);
  }
  function seek(chapter) {
    if (!video.current) return;
    video.current.currentTime =
      view === "source"
        ? (chapter.original_start ?? chapter.source_start)
        : chapter.start;
    video.current.play().catch(() => setMediaError(true));
  }
  return (
    <div className="example-gallery">
      <div className="example-activities" aria-label={t("选择活动")}>
        {catalog.map((item) => (
          <button
            key={item.id}
            onClick={() => selectActivity(item.id)}
            aria-pressed={activityId === item.id}
          >
            <img src={item.poster} alt="" />
            <span>
              <strong>{text(item.title)}</strong>
              <small>{text(item.description)}</small>
            </span>
            {activityId === item.id && <Check size={18} />}
          </button>
        ))}
      </div>
      <section className="example-story">
        <header className="example-header">
          <div>
            <span className="example-label">{t("真实活动示例")}</span>
            <h2>{text(activity.title)}</h2>
            <p>{text(activity.intro)}</p>
          </div>
          <span className="sound-badge">
            <Volume2 size={15} />
            {t("原声保留")}
          </span>
        </header>
        <div
          className="example-people"
          role="tablist"
          aria-label={t("选择人物")}
        >
          {activity.people.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={person.id === item.id}
              onClick={() => {
                setPersonId(item.id);
                setView("film");
                setPlaying(false);
              }}
            >
              <img src={item.portrait} alt="" />
              <span>
                <strong>{text(item.name)}</strong>
                <small>{t("专属影片")}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="example-layout">
          <div className="example-screen">
            <div
              className="example-view"
              role="tablist"
              aria-label={t("观看内容")}
            >
              <button
                role="tab"
                aria-selected={view === "film"}
                onClick={() => {
                  setView("film");
                  setPlaying(false);
                }}
              >
                {t("专属影片")}
              </button>
              <button
                role="tab"
                aria-selected={view === "source"}
                onClick={() => {
                  setView("source");
                  setPlaying(false);
                }}
              >
                {t("活动原片")}
                <span>{seconds(activity.source_duration)}</span>
              </button>
            </div>
            <div className="example-player">
              <video
                ref={video}
                key={`${activityId}:${person.id}:${view}:${locale}`}
                controls
                playsInline
                preload="metadata"
                poster={view === "source" ? activity.poster : person.poster}
                src={view === "source" ? activity.source : version.movie}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onError={() => setMediaError(true)}
                aria-label={
                  view === "source"
                    ? t("活动原片")
                    : text(person.name) + " · " + version.title
                }
              />
              {!playing && !mediaError && (
                <button
                  className="play-film"
                  aria-label={t("播放影片")}
                  onClick={() =>
                    video.current?.play().catch(() => setMediaError(true))
                  }
                >
                  <Play size={22} fill="currentColor" />
                  <span>{t("播放影片")}</span>
                </button>
              )}
            </div>
            {mediaError && (
              <p className="video-error" role="alert">
                {t("影片暂时无法播放，请重试或前往来源页面观看。")}{" "}
                <a href={activity.source_url} target="_blank" rel="noreferrer">
                  {t("查看来源")}
                </a>
              </p>
            )}
            <div className="example-film-meta">
              <div>
                <strong>
                  {view === "source" ? t("活动原片") : version.title}
                </strong>
                <span>
                  {view === "source"
                    ? t("完整保留来源视频的声音与画面")
                    : t(
                        version.chapters.length === 1
                          ? "1 个章节 · {duration}"
                          : "{count} 个章节 · {duration}",
                        {
                          count: version.chapters.length,
                          duration: seconds(version.duration),
                        },
                      )}
                </span>
              </div>
              <a
                className="button"
                href={view === "source" ? activity.source : version.movie}
                download
              >
                <Download size={16} />
                {t("下载影片")}
              </a>
            </div>
          </div>
          <aside className="example-note">
            <span className="example-label">{t("活动记录")}</span>
            <h3>{version.title}</h3>
            <p>{version.note}</p>
            <div className="example-chapters">
              <h4>{t("故事里的瞬间")}</h4>
              {version.chapters.map((chapter, index) => (
                <button key={chapter.segment_id} onClick={() => seek(chapter)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{chapter.heading}</strong>
                    <small>{chapter.caption}</small>
                  </div>
                  <time>
                    {seconds(
                      view === "source"
                        ? (chapter.original_start ?? chapter.source_start)
                        : chapter.start,
                    )}
                  </time>
                </button>
              ))}
            </div>
          </aside>
        </div>
        <details className="example-credit">
          <summary>{t("关于这份示例与素材来源")}</summary>
          <p>{text(activity.context)}</p>
          <p>
            {activity.credit} ·{" "}
            <a href={activity.source_url} target="_blank" rel="noreferrer">
              {t("查看来源")}
            </a>{" "}
            ·{" "}
            <a href={activity.license_url} target="_blank" rel="noreferrer">
              {activity.license}
            </a>
          </p>
          <p>{text(activity.changes)}</p>
          {activity.endorsement_notice && (
            <p lang="en">{activity.endorsement_notice}</p>
          )}
        </details>
      </section>
      <section className="example-start">
        <div>
          <h2>{t("把下一场活动，变成值得保存的故事。")}</h2>
          <p>{t("导入照片和视频，从确认第一个人物开始。")}</p>
        </div>
        <button className="primary" onClick={start}>
          {t("开始我的故事")}
          <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}
