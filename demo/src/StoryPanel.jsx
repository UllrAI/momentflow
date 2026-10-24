import { t, getLocale } from "./i18n";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import { api, seconds } from "./api";
export function StoryPanel({
  project,
  person,
  segments,
  disabled,
  update,
  choose,
  reportError,
  settings,
  setWorkspaceBusy,
}) {
  const story = person.story;
  const [consent, setConsent] = useState(false);
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(story?.title || "");
  const [draft, setDraft] = useState(story?.weekly_note || "");
  const [chapters, setChapters] = useState(story?.chapters || []);
  useEffect(() => {
    setTitle(story?.title || "");
    setDraft(story?.weekly_note || "");
    setChapters(story?.chapters || []);
  }, [story?.id, story?.title, story?.weekly_note]);
  async function run() {
    setBusy(true);
    setWorkspaceBusy(true);
    try {
      update(
        await api(`/projects/${project.id}/people/${person.id}/story`, {
          method: "POST",
          body: {
            consent,
            duration,
            locale: getLocale(),
          },
        }),
      );
    } catch (error) {
      reportError(error.message);
    } finally {
      setBusy(false);
      setWorkspaceBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setWorkspaceBusy(true);
    try {
      const data = await api(
        `/projects/${project.id}/people/${person.id}/story/apply`,
        {
          method: "POST",
          body: {
            story_id: story.id,
            title,
            weekly_note: draft,
            chapters,
          },
        },
      );
      choose(story.selected_ids);
      update(data);
    } catch (error) {
      reportError(error.message);
    } finally {
      setBusy(false);
      setWorkspaceBusy(false);
    }
  }
  const selected =
    story?.selected_ids
      .map((id) => segments.find((s) => s.id === id))
      .filter(Boolean) || [];
  return (
    <section className="story-panel">
      <div className="section-heading">
        <h3>
          <Sparkles size={17} />
          {t("让片段成为故事")}
        </h3>
        <button className="text-button" onClick={settings}>
          {t("模型设置")}
          <ArrowRight size={13} />
        </button>
      </div>
      <p>
        {t(
          "从可见活动中挑选、去重和编排，生成有来源的周记草稿。先核对人物，再开始分析。",
        )}
      </p>
      <div className="story-options">
        <label>
          {t("集锦目标时长")}
          <select
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
            disabled={disabled || busy}
          >
            <option value={15}>{t("15 秒")}</option>
            <option value={30}>{t("30 秒")}</option>
            <option value={60}>{t("60 秒")}</option>
          </select>
        </label>
        <button
          className="primary"
          onClick={run}
          disabled={
            disabled ||
            busy ||
            !consent ||
            !person.confirmed ||
            !person.authorized ||
            !segments.length
          }
        >
          <Sparkles size={15} />
          {story ? t("重新分析故事") : t("分析精彩片段与周记")}
        </button>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          disabled={disabled || busy}
        />
        {t(
          "允许将本人物候选画面发送至 OpenRouter / OpenAI 进行分析；我有权进行此项处理。",
        )}
      </label>
      <details className="analysis-details">
        <summary>{t("分析范围与费用")}</summary>
        <p>
          {t(
            "最多分析 36 个分散候选，每段 1–3 帧。只分析视觉内容，不理解原声；视频原声在本地剪辑时保留。费用由你的 OpenRouter 账户承担。",
          )}
        </p>
      </details>
      {story && (
        <div className={`story-draft ${!story.current ? "stale" : ""}`}>
          <div className="section-heading">
            <strong>
              <BookOpen size={16} />{" "}
              {story.current
                ? t("故事草稿 · 待人工确认")
                : t("历史草稿 · 素材或人物已改变")}
            </strong>
            <span>{seconds(selected.reduce((n, s) => n + s.duration, 0))}</span>
          </div>
          <label>
            {t("故事标题")}
            <input
              value={title}
              maxLength={30}
              onChange={(event) => setTitle(event.target.value)}
              disabled={disabled || busy || !story.current}
            />
          </label>
          <ol className="story-chapters">
            {chapters.map((chapter, index) => {
              const source = segments.find((s) => s.id === chapter.segment_id);
              const observation = story.observations.find(
                (o) => o.segment_id === chapter.segment_id,
              );
              return (
                <li key={chapter.segment_id}>
                  <details>
                    <summary>
                      {index + 1}. {chapter.heading}
                    </summary>
                    <label>
                      {t("章节标题")}
                      <input
                        aria-label={t("章节 {v0} 标题", {
                          v0: index + 1,
                        })}
                        value={chapter.heading}
                        maxLength={20}
                        disabled={disabled || busy || !story.current}
                        onChange={(event) =>
                          setChapters((items) =>
                            items.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    heading: event.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      {t("画面字幕")}
                      <textarea
                        aria-label={t("章节 {v0} 字幕", {
                          v0: index + 1,
                        })}
                        value={chapter.caption}
                        maxLength={60}
                        disabled={disabled || busy || !story.current}
                        onChange={(event) =>
                          setChapters((items) =>
                            items.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    caption: event.target.value,
                                  }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <small>
                      {source?.name || t("来源已改变")}
                      {source?.kind === "video"
                        ? t(" · {v0}–{v1} 秒", {
                            v0: source.start.toFixed(1),
                            v1: source.end.toFixed(1),
                          })
                        : t(" · 照片")}
                    </small>
                    <details>
                      <summary>{t("查看挑选依据")}</summary>
                      <p>{observation?.observation}</p>
                      <p>
                        {observation?.reason}
                        {t("· 精彩度")}
                        {observation?.score}/100
                      </p>
                      <small>
                        {t("证据画面：")}
                        {observation?.evidence_frames.join("、")}
                      </small>
                    </details>
                  </details>
                </li>
              );
            })}
          </ol>
          <label>
            {t("周记草稿")}
            <textarea
              value={draft}
              maxLength={500}
              onChange={(event) => setDraft(event.target.value)}
              disabled={disabled || busy || !story.current}
            />
          </label>
          <small>
            {t(
              "请核对画面与文字。草稿不作为儿童能力、性格或成长水平评价。采用后仍可调整选段和活动记录；改变选段后按手动剪辑生成。",
            )}
          </small>
          <button
            className="accent"
            onClick={apply}
            disabled={
              disabled ||
              busy ||
              !story.current ||
              !person.confirmed ||
              !person.authorized ||
              !title.trim() ||
              !draft.trim() ||
              chapters.some(
                (item) => !item.heading.trim() || !item.caption.trim(),
              )
            }
          >
            <BookOpen size={15} />
            {story.applied
              ? t("重新采用草稿与推荐选段")
              : t("采用草稿与推荐选段")}
          </button>
          <details className="all-observations">
            <summary>
              {t("候选分析记录（{count}）", {
                count: story.observations.length,
              })}
            </summary>
            {story.observations.map((item) => (
              <p key={item.segment_id}>
                <strong>
                  {item.duplicate_of
                    ? t("重复画面")
                    : item.usable
                      ? t("可用")
                      : t("未选用")}{" "}
                  · {item.title}
                </strong>
                ：{item.observation} <small>{item.reason}</small>
              </p>
            ))}
          </details>
        </div>
      )}
    </section>
  );
}
