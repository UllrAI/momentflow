import { t, useLocale, setLocale, quantity } from "./i18n";
import { ExampleGallery } from "./ExampleGallery";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileVideo,
  Film,
  FolderOpen,
  GraduationCap,
  Image as ImageIcon,
  Leaf,
  LoaderCircle,
  Merge,
  Mountain,
  Plus,
  ScanFace,
  Scissors,
  Send,
  Settings,
  ShieldCheck,
  Split,
  Upload,
  Users,
  X,
  AlertCircle,
} from "lucide-react";
import { api, initialSelection, latestExport, seconds } from "./api";
import { ModelSettings } from "./ModelSettings";
import { StoryPanel } from "./StoryPanel";
const scenes = {
  adventure: {
    brand: "MomentFlow · 拾光",
    org: "体验影像工作空间",
    title: "每个人，都有自己的精彩。",
    description: "从真实照片与视频，找到属于每位体验者的瞬间。",
    people: "体验者",
    output: "专属集锦",
    receiver: "游客",
    sample: "体验影像示例",
  },
  kindergarten: {
    brand: "拾光成长",
    org: "我的工作空间",
    title: "本周成长周记",
    description: "先确认人物，再把美好交到家长手中。",
    people: "孩子们",
    output: "成长周记",
    receiver: "家长",
    sample: "幼儿园示例",
  },
};
function Modal({ title, children, close, wide = false }) {
  const ref = useRef(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const before = document.activeElement;
    const dialog = ref.current;
    dialog.focus();
    const key = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = [
          ...dialog.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
          ),
        ];
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    dialog.addEventListener("keydown", key);
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.removeEventListener("keydown", key);
      document.body.style.overflow = priorOverflow;
      before?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <h2>{t(title)}</h2>
          <button aria-label={t("关闭弹窗")} className="icon" onClick={close}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function personStatus(project, person) {
  const output = latestExport(project, person.id);
  if (!person.confirmed || !person.authorized) return ["pending", "待核对人物"];
  if (output?.delivered) return ["delivered", "已交付"];
  if (output?.approved) return ["ready", "可交付"];
  if (output) return ["pending", "待审核成片"];
  return ["idle", "待生成"];
}
function Badge({ project, person }) {
  const [kind, label] = personStatus(project, person);
  return (
    <span className={`badge ${kind}`}>
      <i />
      {t(label)}
    </span>
  );
}
function Empty({ icon: Icon = FolderOpen, title, text, children }) {
  return (
    <div className="empty">
      <Icon size={34} strokeWidth={1.4} />
      <h3>{t(title)}</h3>
      <p>{t(text)}</p>
      {children}
    </div>
  );
}
export function App() {
  const locale = useLocale();
  const peoplePanel = useRef(null);
  const personStudio = useRef(null);
  const [studioTab, setStudioTab] = useState("story");
  const [mode, setMode] = useState(
    () => localStorage.getItem("momentflow-mode") || "kindergarten",
  );
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState(() =>
    location.hash === "#examples" ? "examples" : "workbench",
  );
  const [filter, setFilter] = useState("all");
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(null);
  const [segments, setSegments] = useState([]);
  const [selections, setSelections] = useState({});
  const [faceSelections, setFaceSelections] = useState([]);
  const [correcting, setCorrecting] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [mergeId, setMergeId] = useState("");
  const [newTitle, setNewTitle] = useState("本周成长周记");
  const [className, setClassName] = useState("向日葵班");
  const [importConsent, setImportConsent] = useState(false);
  const [files, setFiles] = useState([]);
  const [reference, setReference] = useState(null);
  const [source, setSource] = useState(null);
  const [interval, setIntervalValue] = useState(1);
  const [recipient, setRecipient] = useState(null);
  const [preserveAudio, setPreserveAudio] = useState(true);
  const scene = Object.fromEntries(
    Object.entries(scenes[mode] || scenes.kindergarten).map(([key, value]) => [
      key,
      t(value),
    ]),
  );
  const person = project?.people.find((p) => p.id === selected);
  const personFaces =
    project?.faces.filter((f) => person?.face_ids.includes(f.id)) || [];
  const currentOutput = latestExport(project, selected);
  const output =
    currentOutput &&
    (!person || note === person.note) &&
    (currentOutput.preserve_audio === undefined ||
      currentOutput.preserve_audio === preserveAudio) &&
    (!selections[selected] ||
      selections[selected].join(",") === currentOutput.segment_ids.join(","))
      ? currentOutput
      : null;
  const running = project?.job?.status === "running";
  const disabled = busy || running;
  const selectedSegments = selections[selected] || [];
  const selectedDuration = selectedSegments.reduce(
    (total, id) => total + (segments.find((s) => s.id === id)?.duration || 0),
    0,
  );
  const availableProjects = projects.filter((p) => p.mode === mode);
  const update = useCallback((data) => {
    setProject(data);
    setProjects((all) => [data, ...all.filter((p) => p.id !== data.id)]);
    setSelected((current) =>
      data.people.some((p) => p.id === current)
        ? current
        : data.people[0]?.id || null,
    );
    localStorage.setItem(`momentflow-project-${data.mode}`, data.id);
  }, []);
  const notify = (text) => setToast(text);
  const act = async (operation) => {
    setBusy(true);
    setError("");
    try {
      return await operation();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const boot = useCallback(async () => {
    try {
      const info = await api("/bootstrap");
      setHealth(info);
      const all = await api("/projects");
      setProjects(all);
      const savedMode =
        localStorage.getItem("momentflow-mode") || "kindergarten";
      const current =
        all.find(
          (p) =>
            p.id === localStorage.getItem(`momentflow-project-${savedMode}`),
        ) || all.find((p) => p.mode === savedMode);
      if (current) update(current);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [update]);
  useEffect(() => {
    history.replaceState(null, "", tab === "examples" ? "#examples" : "#");
  }, [tab]);
  useEffect(() => {
    boot();
  }, [boot]);
  useEffect(() => {
    if (!project?.id || !running) return;
    let cancelled = false,
      timer;
    async function poll() {
      try {
        const data = await api(`/projects/${project.id}`);
        if (!cancelled) update(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
      if (!cancelled) timer = setTimeout(poll, 1200);
    }
    timer = setTimeout(poll, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [project?.id, running, update]);
  useEffect(() => {
    if (!project || !selected) {
      setSegments([]);
      return;
    }
    let alive = true;
    setSegments([]);
    api(`/projects/${project.id}/people/${selected}/segments`)
      .then((data) => {
        if (!alive) return;
        setSegments(data);
        if (!data.length) return;
        setSelections((all) => ({
          ...all,
          [selected]: all[selected]
            ? all[selected].filter((id) => data.some((s) => s.id === id))
            : initialSelection(project, selected, data),
        }));
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [project?.id, selected, project?.analysis_version, person?.revision]);
  useEffect(() => {
    setPreserveAudio(currentOutput?.preserve_audio ?? true);
  }, [selected, currentOutput?.id]);
  useEffect(() => {
    setStudioTab(person?.confirmed && person?.authorized ? "story" : "people");
  }, [selected]);
  useEffect(() => {
    setNote(person?.note || "");
    setFaceSelections([]);
    setCorrecting(false);
  }, [selected, person?.note]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, recipient, mode]);
  function switchScene(value) {
    if (disabled) return;
    setMode(value);
    localStorage.setItem("momentflow-mode", value);
    const current =
      projects.find(
        (p) => p.id === localStorage.getItem(`momentflow-project-${value}`),
      ) || projects.find((p) => p.mode === value);
    setProject(current || null);
    setSelected(current?.people[0]?.id || null);
    setTab("workbench");
    setFilter("all");
    setError("");
    setRecipient(null);
  }
  function openCollection() {
    setNewTitle(t(mode === "kindergarten" ? "本周成长周记" : "体验纪念片"));
    setClassName(mode === "kindergarten" ? t("向日葵班") : "");
    setImportConsent(false);
    setModal("new");
  }
  function identity() {
    setName(
      !person.confirmed && /^待命名人物 \d+$/.test(person.name)
        ? ""
        : person.name,
    );
    setAuthorized(person.authorized);
    setIdentityChecked(false);
    setModal("identity");
  }
  function selectPerson(id) {
    setSelected(id);
    if (window.matchMedia("(max-width: 1000px)").matches) {
      requestAnimationFrame(() =>
        personStudio.current?.scrollIntoView({ block: "start" }),
      );
    }
  }
  async function createProject(sample = false) {
    return act(async () => {
      let data = await api("/projects", {
        method: "POST",
        body: {
          mode,
          title: sample
            ? mode === "kindergarten"
              ? "向日葵班 · 本周成长周记"
              : "体验影像 · 真实识别演示"
            : newTitle,
          class_name: mode === "kindergarten" ? className : "",
          consent: sample || importConsent,
        },
      });
      update(data);
      setModal(null);
      setTab("workbench");
      if (sample) {
        data = await api(`/projects/${data.id}/samples`, {
          method: "POST",
        });
        update(data);
        data = await api(`/projects/${data.id}/analyze`, {
          method: "POST",
          body: {
            sample_interval: 1,
          },
        });
        update(data);
      }
      if (!sample) {
        setFiles([]);
        setModal("upload");
      }
      return data;
    });
  }
  async function upload() {
    return act(async () => {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      const data = await api(`/projects/${project.id}/media`, {
        method: "POST",
        body: form,
      });
      update(data);
      setModal(null);
      setFiles([]);
      notify("素材已保存到本机，可以开始人物识别。");
    });
  }
  async function analyze() {
    await act(async () =>
      update(
        await api(`/projects/${project.id}/analyze`, {
          method: "POST",
          body: {
            sample_interval: interval,
          },
        }),
      ),
    );
  }
  async function saveIdentity() {
    await act(async () => {
      update(
        await api(`/projects/${project.id}/people/${person.id}`, {
          method: "PATCH",
          body: {
            name,
            note: person.note,
            confirmed: identityChecked,
            authorized,
          },
        }),
      );
      setModal(null);
      setStudioTab("story");
      notify("人物身份与授权范围已确认。");
    });
  }
  async function saveNote() {
    return api(`/projects/${project.id}/people/${person.id}`, {
      method: "PATCH",
      body: {
        name: person.name,
        note,
        confirmed: person.confirmed,
        authorized: person.authorized,
      },
    });
  }
  async function render() {
    await act(async () => {
      if (note !== person.note) update(await saveNote());
      update(
        await api(`/projects/${project.id}/people/${person.id}/render`, {
          method: "POST",
          body: {
            segment_ids: selectedSegments,
            preserve_audio: preserveAudio,
            story_id:
              person.story?.current &&
              person.applied_story_id === person.story.id &&
              selectedSegments.length === person.story.selected_ids.length &&
              selectedSegments.every((id) =>
                person.story.selected_ids.includes(id),
              )
                ? person.story.id
                : null,
          },
        }),
      );
    });
  }
  async function approve() {
    await act(async () => {
      update(
        await api(`/projects/${project.id}/exports/${output.id}/approve`, {
          method: "POST",
          body: {
            reviewed,
          },
        }),
      );
      setModal(null);
      notify("当前成片已审核，可以交付。");
    });
  }
  async function deliver() {
    await act(async () => {
      update(
        await api(`/projects/${project.id}/exports/${output.id}/deliver`, {
          method: "POST",
        }),
      );
      notify(t("影片已向{v0}视角开放。", { v0: scene.receiver }));
    });
  }
  async function merge() {
    await act(async () => {
      update(
        await api(`/projects/${project.id}/people/${person.id}/merge`, {
          method: "POST",
          body: {
            other_id: mergeId,
          },
        }),
      );
      setCorrecting(false);
      setMergeId("");
      notify("已合并，请重新核对人物。");
    });
  }
  async function split() {
    await act(async () => {
      update(
        await api(`/projects/${project.id}/people/${person.id}/split`, {
          method: "POST",
          body: {
            face_ids: faceSelections,
          },
        }),
      );
      setFaceSelections([]);
      notify("已拆出新人物组，请分别核对。");
    });
  }
  async function enroll() {
    await act(async () => {
      const form = new FormData();
      form.append("name", name);
      form.append("authorized", String(authorized));
      form.append("file", reference);
      update(
        await api(`/projects/${project.id}/enroll`, {
          method: "POST",
          body: form,
        }),
      );
      setModal(null);
      notify("参考档案已登记，新导入素材将与其比对。");
    });
  }
  const face = personFaces[0];
  const stats = {
    photos: project?.media.filter((m) => m.kind === "image").length || 0,
    videos: project?.media.filter((m) => m.kind === "video").length || 0,
    pending: project?.people.filter((p) => !p.confirmed).length || 0,
    delivered:
      project?.exports.filter((e) => e.current && e.delivered).length || 0,
  };
  const visiblePeople =
    project?.people.filter(
      (p) =>
        filter === "all" ||
        (filter === "pending"
          ? !p.confirmed
          : filter === "delivered"
            ? latestExport(project, p.id)?.delivered
            : p.confirmed),
    ) || [];
  const visibleIds = visiblePeople.map((item) => item.id).join(",");
  useEffect(() => {
    if (!visiblePeople.some((item) => item.id === selected)) {
      setSelected(visiblePeople[0]?.id || null);
    }
  }, [project?.id, filter, selected, visibleIds]);
  const dialogs = (
    <>
      {modal === "new" && (
        <Modal title={t("新建素材批次")} close={() => !busy && setModal(null)}>
          <p className="muted">
            {t(
              "照片、视频、人物特征和影片保存在当前电脑。故事分析仅在你确认后发送候选画面。",
            )}
          </p>
          <label>
            {t("批次名称")}
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={80}
            />
          </label>
          {mode === "kindergarten" && (
            <label>
              {t("班级")}
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                maxLength={60}
              />
            </label>
          )}
          <label className="checkline">
            <input
              type="checkbox"
              checked={importConsent}
              onChange={(e) => setImportConsent(e.target.checked)}
            />
            {t("我有权处理这些照片与视频；涉及儿童时，已取得相应监护授权。")}
          </label>
          <footer>
            <button onClick={() => setModal(null)}>{t("返回")}</button>
            <button
              className="primary"
              disabled={busy || !newTitle.trim() || !importConsent}
              onClick={() => createProject(false)}
            >
              {t("创建批次")}
            </button>
          </footer>
        </Modal>
      )}
      {modal === "upload" && (
        <Modal
          title={t("导入照片与视频")}
          close={() => !busy && setModal(null)}
        >
          <p className="muted">
            {t(
              "素材先保存到本机。人脸识别在本地运行；故事分析由你另行确认后发送候选画面。",
            )}
          </p>
          <label className="dropzone">
            <Upload size={30} />
            <strong>{t("选择活动照片与视频")}</strong>
            <span>JPG / PNG / WebP / MP4 / MOV / WebM / AVI</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-msvideo,.m4v"
              onChange={(e) => {
                setFiles([...e.target.files]);
                e.target.value = "";
              }}
            />
          </label>
          <p className="hint">
            {t(
              "每份 ≤100 MB，视频 ≤5 分钟；每批最多 30 份、总计 ≤500 MB。支持本地视频文件，尚未接监控直播流。",
            )}
          </p>
          <div className="upload-files">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`}>
                <FileVideo size={15} />
                <span>{f.name}</span>
                <small>{(f.size / 1024 / 1024).toFixed(1)} MB</small>
              </div>
            ))}
          </div>
          <footer>
            <button onClick={() => setModal(null)} disabled={busy}>
              {t("返回")}
            </button>
            <button
              className="primary"
              disabled={!files.length || busy}
              onClick={upload}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Upload size={16} />
              )}
              {files.length === 0
                ? t("导入素材")
                : files.length === 1
                  ? t("导入 1 份素材")
                  : t("导入 {count} 份素材", { count: files.length })}
            </button>
          </footer>
        </Modal>
      )}
      {modal === "identity" && person && (
        <Modal
          title={t("核对{v0}身份与授权", {
            v0: mode === "kindergarten" ? t("儿童") : t("人物"),
          })}
          close={() => !busy && setModal(null)}
        >
          <p className="muted">
            {t(
              "以下是同一人物组的实际检测切片。请逐一检查，发现混人时先拆分。",
            )}
          </p>
          <div className="modal-faces">
            {personFaces.map((f, faceIndex) => (
              <img
                key={f.id}
                src={f.thumbnail}
                alt={t("待核对人脸切片")}
                loading="lazy"
              />
            ))}
          </div>
          <label>
            {t("姓名 / 体验者称呼")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
            />
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={identityChecked}
              onChange={(e) => setIdentityChecked(e.target.checked)}
            />
            {t("我已核对本组所有人脸均属于上述人物。")}
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            {mode === "kindergarten"
              ? t("已获得监护人关于拍摄、人物关联及本儿童影像领取的相应授权。")
              : t("已确认拍摄、人物关联和影像领取的相应授权。")}
          </label>
          <footer>
            <button onClick={() => setModal(null)}>{t("返回检查")}</button>
            <button
              className="primary"
              disabled={
                busy ||
                !identityChecked ||
                !authorized ||
                !name.trim() ||
                name.startsWith("待命名")
              }
              onClick={saveIdentity}
            >
              {t("确认身份与授权")}
            </button>
          </footer>
        </Modal>
      )}
      {modal === "enroll" && (
        <Modal
          title={t("登记{v0}", {
            v0: mode === "kindergarten" ? t("儿童参考档案") : t("人物参考照片"),
          })}
          close={() => !busy && setModal(null)}
        >
          <p className="muted">
            {t(
              "上传一张仅有本人、清晰正面的人脸照片。识别只在此批次内比对，不搜索外部身份库。已有聚类结果时，可以人工合并到参考档案。",
            )}
          </p>
          <label>
            {t("姓名")}
            <input
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {t("正面参考照片")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setReference(e.target.files[0] || null)}
            />
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            {t("我已获得此人物或其监护人关于照片关联和影像领取的相应授权。")}
          </label>
          <footer>
            <button onClick={() => setModal(null)}>{t("返回")}</button>
            <button
              className="primary"
              disabled={busy || !authorized || !name.trim() || !reference}
              onClick={enroll}
            >
              {t("登记参考档案")}
            </button>
          </footer>
        </Modal>
      )}
      {modal === "approve" && (
        <Modal title={t("审核当前成片")} close={() => !busy && setModal(null)}>
          <p className="muted">
            {t(
              "请先完整播放影片。只确认当前版本，之后修改素材、人物分组、姓名或记录，都需重新生成并审核。",
            )}
          </p>
          <label className="checkline">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            {t(
              "我已检查人物身份、非目标人脸遮盖、所选片段、章节字幕、周记、原声授权和接收范围，确认可以交付。",
            )}
          </label>
          <div className="notice">
            <ShieldCheck size={18} />
            {t(
              "自动遮盖仅覆盖检测到的非目标人脸，漏检仍需人工检查。此步骤不代表系统能保证零误识别。",
            )}
          </div>
          <footer>
            <button onClick={() => setModal(null)}>{t("返回播放")}</button>
            <button
              className="primary"
              disabled={!reviewed || busy}
              onClick={approve}
            >
              <Check size={16} />
              {t("审核通过")}
            </button>
          </footer>
        </Modal>
      )}
      {source && (
        <Modal title={source.media.name} close={() => setSource(null)} wide>
          <div className="source-viewer">
            {source.media.kind === "video" ? (
              <video
                key={`${source.media.id}-${source.time}`}
                controls
                autoPlay
                playsInline
                src={`${source.media.url}#t=${source.time || 0}`}
              />
            ) : (
              <div className="source-image">
                <img src={source.media.url} alt={t("原始照片")} />
                {source.face && (
                  <div
                    className="face-box"
                    style={{
                      left: `${(source.face.bbox[0] / source.media.width) * 100}%`,
                      top: `${(source.face.bbox[1] / source.media.height) * 100}%`,
                      width: `${(source.face.bbox[2] / source.media.width) * 100}%`,
                      height: `${(source.face.bbox[3] / source.media.height) * 100}%`,
                    }}
                  />
                )}
              </div>
            )}
          </div>
          <p className="hint">
            {source.face
              ? t("检测时间 {v0} · 人脸检测置信度 {v1}%（不是身份正确概率）", {
                  v0: seconds(source.time || 0),
                  v1: Math.round(source.face.confidence * 100),
                })
              : t("原始素材预览，仅当前本地工作空间可访问。")}
          </p>
        </Modal>
      )}
    </>
  );
  if (recipient) {
    const deliveredPerson = project.people.find((p) => p.id === recipient);
    const deliveredOutput = latestExport(project, recipient);
    return (
      <div className="recipient-shell">
        <div className="recipient-demo">
          <select
            aria-label="Language / 语言"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            <option value="zh">简体中文</option>
            <option value="en">English</option>
          </select>
          <span>
            {t("本地演示 ·")}
            {t(scene.receiver)}
            {t("视角")}
          </span>
          <button onClick={() => setRecipient(null)}>
            <ArrowLeft size={13} />
            {t("返回工作台")}
          </button>
        </div>
        <main className="recipient-page">
          <div className="recipient-brand">
            <Leaf size={25} />
            <strong>
              {mode === "kindergarten" ? t("拾光成长") : t("MomentFlow · 拾光")}
            </strong>
            <span>{project.class_name || t("专属体验影像")}</span>
          </div>
          {deliveredOutput?.delivered && deliveredOutput?.approved ? (
            <>
              <h1>
                {deliveredOutput.story_title ||
                  t("{v0}的{v1}", {
                    v0: deliveredPerson.name,
                    v1: scene.output,
                  })}
              </h1>
              <p className="muted">{project.title}</p>
              <video
                key={deliveredOutput.id}
                controls
                playsInline
                preload="metadata"
                src={deliveredOutput.url}
              />
              <div className="recipient-note">
                <h3>
                  {mode === "kindergarten"
                    ? t("老师想和你分享")
                    : t("这次体验，值得回放")}
                </h3>
                <p>
                  {deliveredOutput.note ||
                    t("属于你的精彩瞬间，都收在这份小小的回忆里。")}
                </p>
              </div>
              <a
                className="button primary download"
                href={deliveredOutput.claim_url}
                download
              >
                <Download size={18} />
                {t("下载影片")}
                <ArrowRight size={18} />
              </a>
              <p className="recipient-foot">
                {t("真实生成的 720p MP4 ·")}{" "}
                {deliveredOutput.muted ? t("无原声音轨") : t("保留原声")} ·{" "}
                {seconds(deliveredOutput.duration)}
                <br />
                {t("本页为本机领取演示，暂不支持跨设备分享。")}
              </p>
            </>
          ) : (
            <Empty
              icon={ShieldCheck}
              title={t("这份影片还未开放")}
              text={t("老师完成当前版本审核并交付后，才可以领取。")}
            />
          )}
        </main>
        {error && (
          <div className="toast error" role="alert">
            {t(error)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div
      className={`app-shell ${mode === "kindergarten" ? "kindergarten" : "adventure"}`}
    >
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          aria-label={t("拾光，返回工作台")}
          onClick={() => setTab("workbench")}
        >
          {mode === "kindergarten" ? (
            <Leaf size={34} />
          ) : (
            <Mountain size={34} />
          )}
          <div>
            <strong>{t(scene.brand)}</strong>
          </div>
        </a>
        <div className="scene-switch">
          <button
            disabled={disabled}
            aria-label={t("体验场景")}
            className={mode === "adventure" ? "active" : ""}
            onClick={() => switchScene("adventure")}
          >
            <Mountain size={14} />
            {t("体验")}
          </button>
          <button
            disabled={disabled}
            aria-label={t("幼儿园场景")}
            className={mode === "kindergarten" ? "active" : ""}
            onClick={() => switchScene("kindergarten")}
          >
            <GraduationCap size={15} />
            {t("幼儿园")}
          </button>
        </div>
        <nav aria-label={t("主导航")}>
          {[
            ["workbench", t("批次交付工作台"), Send],
            ["examples", t("故事示例"), Film],
            ["media", t("素材库"), FolderOpen],
            ["settings", t("设置与处理说明"), Settings],
          ].map(([id, title, Icon]) => (
            <button
              key={id}
              aria-label={title}
              className={tab === id ? "active" : ""}
              disabled={busy}
              onClick={() => {
                setTab(id);
              }}
            >
              <Icon size={19} />
              <span>{t(title)}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={18} />
          <strong>{t("识别与素材，留在本机。")}</strong>
          <p>
            {t("人物识别与原声剪辑在本机进行。")}
            <br />
            {t("故事分析经确认后发送候选画面。")}
          </p>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <span>{t(scene.org)}</span>
            {project?.class_name &&
              tab !== "examples" &&
              tab !== "settings" && (
                <>
                  <ChevronRight size={13} />
                  <strong>{project.class_name}</strong>
                </>
              )}
          </div>
          <div className="topbar-tools">
            <label className="language-picker">
              <span className="sr-only">Language / 语言</span>
              <select
                aria-label="Language / 语言"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                <option value="zh">简体中文</option>
                <option value="en">English</option>
              </select>
            </label>
          </div>
        </header>
        <section className="page-heading">
          <div>
            <h1>
              {tab === "examples"
                ? t("一个镜头，各自的故事。")
                : tab === "media"
                  ? t("把精彩，汇聚在一起。")
                  : tab === "settings"
                    ? t("工作空间与处理边界")
                    : scene.title}
            </h1>
            <p>
              {tab === "examples"
                ? t("看看真实活动如何变成每个人的专属影片。")
                : tab === "settings"
                  ? t("管理故事助手、素材保存与分享范围。")
                  : tab === "media"
                    ? t("查看活动原片，或继续添加新的照片和视频。")
                    : t(scene.description)}
            </p>
          </div>
          {tab !== "examples" && tab !== "settings" && (
            <div className="heading-actions">
              <button disabled={!health || disabled} onClick={openCollection}>
                <Plus size={16} />
                {t("新建批次")}
              </button>
              <button
                className="primary"
                disabled={!project || disabled}
                onClick={() => {
                  setFiles([]);
                  setModal("upload");
                }}
              >
                <Upload size={17} />
                {t("导入素材")}
              </button>
            </div>
          )}
        </section>
        {tab === "examples" ? (
          <ExampleGallery
            locale={locale}
            start={() => {
              setTab("workbench");
              openCollection();
            }}
          />
        ) : (
          <>
            {error && (
              <div className="error-banner" role="alert">
                <AlertCircle size={18} />
                <span>{t(error)}</span>
                <button onClick={() => (health ? setError("") : boot())}>
                  {health ? t("关闭") : t("重新连接")}
                </button>
              </div>
            )}
            {health && (!health.models_ready || !health.ffmpeg_ready) && (
              <div className="error-banner">
                <AlertCircle size={18} />
                <span>
                  {t(
                    "本地识别模型或 FFmpeg 尚未准备好，请执行 npm run setup。",
                  )}
                </span>
              </div>
            )}
            {!health && !error && (
              <Empty
                icon={LoaderCircle}
                title={t("正在连接本地处理服务")}
                text={t("加载工作空间与识别模型状态。")}
              />
            )}
            {health && (
              <>
                {tab !== "settings" && (
                  <div className="batch-toolbar">
                    <label>
                      <FolderOpen size={17} />
                      <select
                        aria-label={t("当前素材批次")}
                        value={project?.id || ""}
                        disabled={disabled}
                        onChange={(e) => {
                          const data = projects.find(
                            (p) => p.id === e.target.value,
                          );
                          if (data) {
                            update(data);
                            setFilter("all");
                          }
                        }}
                      >
                        <option value="" disabled>
                          {t("选择素材批次")}
                        </option>
                        {availableProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </label>
                    <span>
                      {quantity(stats.photos, "张照片")}
                      <i />
                      {quantity(stats.videos, "段视频")}
                    </span>
                    {project &&
                      project.media.some((m) => m.status !== "analyzed") && (
                        <div className="batch-actions">
                          <label className="sampling">
                            {t("抽帧间隔")}
                            <select
                              aria-label={t("抽帧间隔")}
                              disabled={disabled || project.faces.length > 0}
                              value={
                                project.faces.length
                                  ? project.sample_interval
                                  : interval
                              }
                              onChange={(e) =>
                                setIntervalValue(Number(e.target.value))
                              }
                            >
                              <option value="0.5">{t("0.5 秒")}</option>
                              <option value="1">{t("1 秒")}</option>
                              <option value="2">{t("2 秒")}</option>
                            </select>
                          </label>
                          <button
                            disabled={
                              disabled ||
                              !project.media.some(
                                (m) => m.status !== "analyzed",
                              ) ||
                              !health.models_ready
                            }
                            onClick={analyze}
                          >
                            <ScanFace size={16} />
                            {t("开始人物识别")}
                          </button>
                        </div>
                      )}
                  </div>
                )}
                {project?.practice_media && (
                  <p className="practice-banner">
                    <Film size={16} />
                    {t("练习素材包含虚构人物，仅用于体验操作。")}
                  </p>
                )}
                {running && (
                  <div className="job-panel" role="status">
                    <LoaderCircle className="spin" size={21} />
                    <div>
                      <strong>{t(project.job.stage)}</strong>
                      <progress value={project.job.progress} max="100" />
                    </div>
                    <span>{project.job.progress}%</span>
                    <button
                      onClick={() =>
                        act(() =>
                          api(`/projects/${project.id}/cancel`, {
                            method: "POST",
                          }),
                        )
                      }
                      disabled={busy}
                    >
                      {t("取消任务")}
                    </button>
                  </div>
                )}
                {project?.job?.status === "failed" && (
                  <div className="error-banner" role="alert">
                    <AlertCircle size={18} />
                    <span>{t(project.job.error)}</span>
                    <small>{t("保留已导入素材，可以重试。")}</small>
                  </div>
                )}
                {tab === "settings" && <ModelSettings reportError={setError} />}
                {tab === "settings" && (
                  <section className="settings-panel">
                    <h2>{t("隐私与数据")}</h2>
                    <dl>
                      <div>
                        <dt>{t("素材保存在本机")}</dt>
                        <dd>
                          {t(
                            "照片、视频和人物分组会保存在当前电脑，刷新或重启后可继续编辑。",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("由你决定是否使用 AI")}</dt>
                        <dd>
                          {t(
                            "仅在你同意后发送候选画面进行故事分析，人物特征与原声留在本机。",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("交付前由你审核")}</dt>
                        <dd>
                          {t(
                            "确认人物、文字和原声后再交付。系统会遮盖检测到的其他人脸，仍需检查遗漏。",
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("当前支持本机领取")}</dt>
                        <dd>
                          {t(
                            "可在当前浏览器查看领取页并下载影片。跨设备分享与接收者账号尚未提供。",
                          )}
                        </dd>
                      </div>
                    </dl>
                    {project && (
                      <button
                        className="danger"
                        disabled={disabled}
                        onClick={() => setModal("delete")}
                      >
                        <X size={16} />
                        {t("删除本批次及人脸数据")}
                      </button>
                    )}
                  </section>
                )}
                {tab === "settings" ? null : !project ? (
                  <div className="welcome">
                    <div>
                      <h2>
                        {mode === "kindergarten" ? (
                          <>
                            {t("把散落的日常，")}
                            <br />
                            {t("收成每个孩子的成长故事。")}
                          </>
                        ) : (
                          <>
                            {t("一场体验，很多镜头。")}
                            <br />
                            {t("让回忆，找到它的主人。")}
                          </>
                        )}
                      </h2>
                      <p>
                        {t("导入真实照片与视频，检测人脸、聚成不同人物，")}
                        <br />
                        {t("核对身份后，生成每个人自己的纪念片。")}
                      </p>
                      <div>
                        <button
                          className="primary"
                          disabled={busy || !health.models_ready}
                          onClick={() => setTab("examples")}
                        >
                          {busy ? (
                            <LoaderCircle className="spin" size={16} />
                          ) : (
                            <ArrowRight size={16} />
                          )}
                          {t("观看真实示例")}
                        </button>
                        <button disabled={busy} onClick={openCollection}>
                          {t("从自己的素材开始")}
                        </button>
                      </div>
                      <details className="fixture-option">
                        <summary>{t("体验示例素材处理")}</summary>
                        <p>
                          {t(
                            "虚构人物素材仅供体验操作，识别与剪辑在本机实际运行。",
                          )}
                        </p>
                        <button
                          disabled={disabled || !health.models_ready}
                          onClick={() => createProject(true)}
                        >
                          {t("导入虚构人物素材")}
                        </button>
                      </details>
                    </div>
                    <img
                      src={
                        mode === "kindergarten"
                          ? "/samples/kindergarten/blocks.jpg"
                          : "/media/zipline.jpg"
                      }
                      alt={
                        mode === "kindergarten"
                          ? t("三位虚构儿童在教室搭积木")
                          : t("两位虚构体验者在松林滑索平台")
                      }
                    />
                  </div>
                ) : (
                  <>
                    {tab === "workbench" && (
                      <>
                        <ol className="workflow" aria-label={t("制作流程")}>
                          {[
                            t("导入素材"),
                            t("确认人物"),
                            t("整理故事"),
                            t("审核交付"),
                          ].map((label, index) => {
                            const stage =
                              !project.media.length || !project.faces.length
                                ? 0
                                : !person?.confirmed || !person?.authorized
                                  ? 1
                                  : !output
                                    ? 2
                                    : 3;
                            return (
                              <li
                                key={label}
                                aria-current={
                                  stage === index ? "step" : undefined
                                }
                                className={
                                  stage === index
                                    ? "current"
                                    : stage > index
                                      ? "complete"
                                      : ""
                                }
                              >
                                <span>
                                  {stage > index ? (
                                    <Check size={14} />
                                  ) : (
                                    index + 1
                                  )}
                                </span>
                                <strong>{label}</strong>
                              </li>
                            );
                          })}
                        </ol>
                        <div className="summary-line">
                          <span>
                            <b>{quantity(project.people.length, "个人物组")}</b>
                            <i>·</i>
                            <em>
                              {stats.pending}
                              {t("份待核对")}
                            </em>
                            <i>·</i>
                            {stats.delivered}
                            {t("份已交付")}
                          </span>
                          <button
                            disabled={disabled}
                            onClick={() => {
                              setName("");
                              setAuthorized(false);
                              setReference(null);
                              setModal("enroll");
                            }}
                          >
                            <Plus size={14} />
                            {t("登记参考档案")}
                          </button>
                        </div>
                        <div className="delivery-grid">
                          <section className="people-panel" ref={peoplePanel}>
                            <div
                              className="filter-tabs"
                              role="tablist"
                              aria-label={t("人物状态")}
                            >
                              {[
                                ["all", t("全部人物")],
                                ["pending", t("待核对")],
                                ["confirmed", t("已确认")],
                                ["delivered", t("已交付")],
                              ].map(([id, title]) => (
                                <button
                                  role="tab"
                                  aria-selected={filter === id}
                                  className={filter === id ? "active" : ""}
                                  key={id}
                                  onClick={() => setFilter(id)}
                                >
                                  {t(title)}
                                </button>
                              ))}
                            </div>
                            <div className="people-table-header">
                              <span>
                                {mode === "kindergarten"
                                  ? t("幼儿 / 人物组")
                                  : t("人物组")}
                              </span>
                              <span>{t("来源切片")}</span>
                              <span>{t("状态")}</span>
                            </div>
                            {visiblePeople.map((p) => {
                              const faces = project.faces.filter((f) =>
                                p.face_ids.includes(f.id),
                              );
                              return (
                                <button
                                  className={`person-row ${selected === p.id ? "active" : ""}`}
                                  key={p.id}
                                  disabled={busy}
                                  onClick={() => selectPerson(p.id)}
                                >
                                  <span className="person-identity">
                                    <img src={faces[0]?.thumbnail} alt="" />
                                    <span>
                                      <strong>{t(p.name)}</strong>
                                      <small>
                                        {quantity(p.face_count, "个出镜切片")}
                                        {faces.some((f) => f.reference)
                                          ? t(" · 已登记参考照")
                                          : ""}
                                      </small>
                                    </span>
                                  </span>
                                  <span className="row-thumbs">
                                    {faces
                                      .filter((f) => !f.reference)
                                      .slice(0, 3)
                                      .map((f) => (
                                        <img
                                          src={f.thumbnail}
                                          key={f.id}
                                          alt={t("出镜人脸切片")}
                                        />
                                      ))}
                                  </span>
                                  <Badge project={project} person={p} />
                                  <ChevronRight size={14} />
                                </button>
                              );
                            })}
                            {!visiblePeople.length && (
                              <Empty
                                icon={ScanFace}
                                title={
                                  project.people.length
                                    ? t("这个状态下还没有人物")
                                    : running
                                      ? t("正在从真实素材中寻找面孔")
                                      : t("先让镜头里的面孔，相聚在一起。")
                                }
                                text={
                                  project.media.length
                                    ? t(
                                        "点击“开始人物识别”，系统会保留出镜时间与来源。识别不到的人脸不会被强行命名。",
                                      )
                                    : t(
                                        "先导入活动照片、视频，或使用一组示例素材。",
                                      )
                                }
                              >
                                {!project.media.length && (
                                  <button
                                    disabled={disabled}
                                    onClick={() =>
                                      act(async () =>
                                        update(
                                          await api(
                                            `/projects/${project.id}/samples`,
                                            {
                                              method: "POST",
                                            },
                                          ),
                                        ),
                                      )
                                    }
                                  >
                                    {t("导入示例素材")}
                                  </button>
                                )}
                              </Empty>
                            )}
                            <div className="panel-footer">
                              <ShieldCheck size={13} />
                              <span>
                                {t("聚类只关联人物，不代替身份与授权核对。")}
                              </span>
                            </div>
                          </section>
                          <section className="detail-panel" ref={personStudio}>
                            <button
                              className="text-button back-to-people"
                              onClick={() =>
                                peoplePanel.current?.scrollIntoView({
                                  block: "start",
                                })
                              }
                            >
                              <ArrowLeft size={15} />
                              {t("返回人物列表")}
                            </button>
                            {person ? (
                              <>
                                <header className="person-heading">
                                  <img
                                    src={face?.thumbnail}
                                    alt={t("{v0}人脸切片", {
                                      v0: t(person.name),
                                    })}
                                  />
                                  <div>
                                    <h2>{t(person.name)}</h2>
                                    <p>{project.title}</p>
                                  </div>
                                  <Badge project={project} person={person} />
                                </header>
                                <div className="movie-preview">
                                  {output ? (
                                    <video
                                      key={output.id}
                                      controls
                                      playsInline
                                      preload="metadata"
                                      src={output.url}
                                    />
                                  ) : (
                                    <>
                                      <img
                                        src={
                                          segments[0]?.thumbnail ||
                                          face?.thumbnail
                                        }
                                        alt={t("待生成集锦的素材封面")}
                                      />
                                      <div>
                                        <Film size={26} />
                                        <strong>
                                          {person.confirmed
                                            ? t(
                                                "准备好{v0}的片段，再生成预览。",
                                                {
                                                  v0: scene.output,
                                                },
                                              )
                                            : t("先核对人物，再生成专属集锦。")}
                                        </strong>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <div className="detail-actions">
                                  <button
                                    className={
                                      !person.confirmed ? "primary" : ""
                                    }
                                    disabled={disabled}
                                    onClick={identity}
                                  >
                                    <Users size={16} />
                                    {person.confirmed
                                      ? t("重新核对人物")
                                      : t("核对人物与授权")}
                                  </button>
                                  <button
                                    disabled={disabled}
                                    onClick={() => {
                                      setStudioTab("people");
                                      setCorrecting(!correcting);
                                    }}
                                  >
                                    <Scissors size={16} />
                                    {correcting ? t("结束纠错") : t("纠正分组")}
                                  </button>
                                </div>
                                <div
                                  className="studio-tabs"
                                  role="tablist"
                                  aria-label={t("影片编辑")}
                                >
                                  {[
                                    ["story", t("故事")],
                                    ["clips", t("片段")],
                                    ["people", t("人物")],
                                  ].map(([id, label]) => (
                                    <button
                                      key={id}
                                      role="tab"
                                      aria-selected={studioTab === id}
                                      onClick={() => setStudioTab(id)}
                                    >
                                      {label}
                                      {id === "clips" && (
                                        <span>{selectedSegments.length}</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                                {studioTab === "people" && (
                                  <div
                                    className="studio-content"
                                    role="tabpanel"
                                    aria-label={t("人物")}
                                  >
                                    <div className="section-heading">
                                      <h3>
                                        {t("人脸切片")}
                                        <span>({personFaces.length})</span>
                                      </h3>
                                      <small>{t("点击查看原始来源")}</small>
                                    </div>
                                    <div className="face-strip">
                                      {personFaces.map((f, faceIndex) => (
                                        <div className="face-cell" key={f.id}>
                                          {correcting ? (
                                            <label>
                                              <input
                                                type="checkbox"
                                                aria-label={t("选择人脸 {v0}", {
                                                  v0: faceIndex + 1,
                                                })}
                                                checked={faceSelections.includes(
                                                  f.id,
                                                )}
                                                onChange={(e) =>
                                                  setFaceSelections((all) =>
                                                    e.target.checked
                                                      ? [...all, f.id]
                                                      : all.filter(
                                                          (id) => id !== f.id,
                                                        ),
                                                  )
                                                }
                                              />
                                              <img
                                                src={f.thumbnail}
                                                alt={t("待纠正的人脸切片")}
                                              />
                                            </label>
                                          ) : (
                                            <button
                                              onClick={() => {
                                                const media =
                                                  project.media.find(
                                                    (m) => m.id === f.media_id,
                                                  );
                                                if (media)
                                                  setSource({
                                                    media,
                                                    face: f,
                                                    time: f.timestamp,
                                                  });
                                                else
                                                  notify(
                                                    t(
                                                      "这是授权登记的参考照片。",
                                                    ),
                                                  );
                                              }}
                                            >
                                              <img
                                                src={f.thumbnail}
                                                alt={t("{v0}人脸切片", {
                                                  v0: f.reference
                                                    ? t("参考照")
                                                    : t("出镜 {v0}", {
                                                        v0: seconds(
                                                          f.timestamp,
                                                        ),
                                                      }),
                                                })}
                                              />
                                            </button>
                                          )}
                                          <small>
                                            {f.reference
                                              ? t("参考照")
                                              : seconds(f.timestamp)}
                                          </small>
                                        </div>
                                      ))}
                                    </div>
                                    {personFaces.length > 60 && (
                                      <p className="hint">
                                        {t("可横向滚动查看全部切片。人物组共")}{" "}
                                        {personFaces.length}
                                        {t("张，核对完整来源后再确认。")}
                                      </p>
                                    )}
                                    {correcting && (
                                      <div className="correction-box">
                                        <strong>
                                          {t(
                                            "把误归的人脸拆出，或合并重复人物。",
                                          )}
                                        </strong>
                                        <p>
                                          {t(
                                            "同一帧同时出现的不同人脸不能合并。纠错后需重新确认人物与成片。",
                                          )}
                                        </p>
                                        <button
                                          disabled={
                                            disabled ||
                                            !faceSelections.length ||
                                            faceSelections.length ===
                                              personFaces.length
                                          }
                                          onClick={split}
                                        >
                                          <Split size={15} />
                                          {t("将选中")}
                                          {faceSelections.length}
                                          {t("张拆为新人物")}
                                        </button>
                                        <div>
                                          <select
                                            aria-label={t("合并另一人物组")}
                                            value={mergeId}
                                            onChange={(e) =>
                                              setMergeId(e.target.value)
                                            }
                                          >
                                            <option value="">
                                              {t("选择要合并的人物组")}
                                            </option>
                                            {project.people
                                              .filter((p) => p.id !== person.id)
                                              .map((p) => (
                                                <option key={p.id} value={p.id}>
                                                  {t(p.name)} ·{" "}
                                                  {quantity(
                                                    p.face_count,
                                                    "个出镜切片",
                                                  )}
                                                </option>
                                              ))}
                                          </select>
                                          <button
                                            disabled={!mergeId || disabled}
                                            onClick={merge}
                                          >
                                            <Merge size={15} />
                                            {t("合并")}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {studioTab === "story" && (
                                  <StoryPanel
                                    key={`${project.id}:${person.id}`}
                                    project={project}
                                    person={person}
                                    segments={segments}
                                    disabled={disabled}
                                    update={update}
                                    choose={(ids) =>
                                      setSelections((all) => ({
                                        ...all,
                                        [selected]: ids,
                                      }))
                                    }
                                    reportError={setError}
                                    setWorkspaceBusy={setBusy}
                                    settings={() => setTab("settings")}
                                  />
                                )}
                                {studioTab === "clips" && (
                                  <div
                                    className="studio-content"
                                    role="tabpanel"
                                    aria-label={t("片段")}
                                  >
                                    <div className="section-heading">
                                      <h3>
                                        {mode === "kindergarten"
                                          ? t("本周精彩片段")
                                          : t("个人出镜片段")}{" "}
                                        <span>({segments.length})</span>
                                      </h3>
                                      <span>
                                        {selectedSegments.length}
                                        {t("段已选 ·")}{" "}
                                        {seconds(selectedDuration)}
                                      </span>
                                    </div>
                                    <div className="segments-list">
                                      {segments.map((s, segmentIndex) => (
                                        <label
                                          className={`segment ${selectedSegments.includes(s.id) ? "selected" : ""}`}
                                          key={s.id}
                                        >
                                          <input
                                            type="checkbox"
                                            disabled={disabled}
                                            checked={selectedSegments.includes(
                                              s.id,
                                            )}
                                            onChange={(e) =>
                                              setSelections((all) => ({
                                                ...all,
                                                [selected]: e.target.checked
                                                  ? [...selectedSegments, s.id]
                                                  : selectedSegments.filter(
                                                      (id) => id !== s.id,
                                                    ),
                                              }))
                                            }
                                          />
                                          <img
                                            src={s.thumbnail}
                                            alt={t("片段来源缩略图")}
                                          />
                                          <span>
                                            <strong>{s.name}</strong>
                                            <small>
                                              {s.kind === "video" ? (
                                                <>
                                                  <FileVideo size={11} />
                                                  {t("原视频")}
                                                  {s.start.toFixed(1)}–
                                                  {s.end.toFixed(1)}
                                                  {t("秒")}
                                                </>
                                              ) : (
                                                <>
                                                  <ImageIcon size={11} />
                                                  {t("活动照片 · 展示 3 秒")}
                                                </>
                                              )}
                                              {s.other_faces > 0 &&
                                                t(" · 含其他出镜人脸")}
                                            </small>
                                          </span>
                                          <button
                                            type="button"
                                            className="icon"
                                            aria-label={t("预览片段 {v0}", {
                                              v0: segmentIndex + 1,
                                            })}
                                            onClick={(e) => {
                                              e.preventDefault();
                                              setSource({
                                                media: project.media.find(
                                                  (m) => m.id === s.media_id,
                                                ),
                                                time: s.start,
                                              });
                                            }}
                                          >
                                            <ChevronRight size={16} />
                                          </button>
                                        </label>
                                      ))}
                                    </div>
                                    {!segments.length && (
                                      <p className="hint">
                                        {t(
                                          "尚未找到此人物的活动素材。参考照片仅用于身份比对，不会放入集锦。",
                                        )}
                                      </p>
                                    )}
                                    {selectedSegments.length > 1 && (
                                      <div className="sequence">
                                        <strong>{t("成片顺序")}</strong>
                                        {selectedSegments.map((id, i) => (
                                          <span key={id}>
                                            <small>
                                              {i + 1}.{" "}
                                              {
                                                segments.find(
                                                  (s) => s.id === id,
                                                )?.name
                                              }
                                            </small>
                                            <button
                                              aria-label={t(
                                                "前移已选片段 {v0}",
                                                {
                                                  v0: i + 1,
                                                },
                                              )}
                                              className="icon"
                                              disabled={i === 0 || disabled}
                                              onClick={() =>
                                                setSelections((all) => {
                                                  const next = [
                                                    ...selectedSegments,
                                                  ];
                                                  [next[i - 1], next[i]] = [
                                                    next[i],
                                                    next[i - 1],
                                                  ];
                                                  return {
                                                    ...all,
                                                    [selected]: next,
                                                  };
                                                })
                                              }
                                            >
                                              <ArrowUp size={13} />
                                            </button>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {studioTab === "clips" && (
                                  <label className="teacher-note">
                                    {mode === "kindergarten"
                                      ? t("老师的活动记录")
                                      : t("这份回忆的记录")}
                                    <textarea
                                      value={note}
                                      maxLength={500}
                                      disabled={disabled}
                                      onChange={(e) => setNote(e.target.value)}
                                      placeholder={
                                        mode === "kindergarten"
                                          ? t(
                                              "写下你实际观察到的活动与细节。文字由老师确认，不自动推断孩子的能力或性格。",
                                            )
                                          : t("写下关于这次体验的简短记录。")
                                      }
                                    />
                                    <small>
                                      {note.length}
                                      {t("/500 · 会展示给")}
                                      {t(scene.receiver)}
                                    </small>
                                  </label>
                                )}
                                <label className="check-row audio-option">
                                  <input
                                    type="checkbox"
                                    checked={preserveAudio}
                                    disabled={disabled}
                                    onChange={(event) =>
                                      setPreserveAudio(event.target.checked)
                                    }
                                  />
                                  {t("保留视频原声（照片段补静音）")}
                                </label>
                                <p className="hint">
                                  {t(
                                    "原声包含当时所有人的声音，交付前请检查对白与环境声的授权范围。",
                                  )}
                                </p>
                                <div className="production-controls">
                                  <button
                                    className="primary"
                                    disabled={
                                      disabled ||
                                      !person.confirmed ||
                                      !person.authorized ||
                                      !selectedSegments.length ||
                                      selectedDuration > 60 ||
                                      selectedSegments.length > 12
                                    }
                                    onClick={render}
                                  >
                                    <Film size={17} />
                                    {output
                                      ? t("重新生成集锦")
                                      : t("生成专属集锦")}
                                  </button>
                                  <button
                                    disabled={
                                      disabled || !output || output.approved
                                    }
                                    onClick={() => {
                                      setReviewed(false);
                                      setModal("approve");
                                    }}
                                  >
                                    <Check size={16} />
                                    {output?.approved
                                      ? t("当前版本已审核")
                                      : t("审核当前成片")}
                                  </button>
                                  <button
                                    className="accent"
                                    disabled={
                                      disabled ||
                                      !output?.approved ||
                                      output.delivered
                                    }
                                    onClick={deliver}
                                  >
                                    <Send size={16} />
                                    {output?.delivered
                                      ? t("已交付")
                                      : t("交付{v0}", {
                                          v0: scene.receiver,
                                        })}
                                  </button>
                                  {output?.delivered && (
                                    <button
                                      onClick={() => setRecipient(person.id)}
                                    >
                                      <ArrowRight size={16} />
                                      {t(scene.receiver)}
                                      {t("领取页")}
                                    </button>
                                  )}
                                </div>
                                <div className="notice">
                                  <ShieldCheck size={17} />
                                  <p>
                                    {t(
                                      "成片为 720p MP4，使用原视频动态画面，可保留原声。逐帧遮盖检测到的非目标人脸；仍需人工复核，不能保证零漏检。",
                                    )}
                                  </p>
                                </div>
                              </>
                            ) : (
                              <Empty
                                icon={Leaf}
                                title={t("选一个人物，看看属于他的瞬间。")}
                                text={t(
                                  "识别完成后，左侧会出现实际检测到的人物组。",
                                )}
                              />
                            )}
                          </section>
                        </div>
                      </>
                    )}
                    {tab === "media" && (
                      <section className="media-library">
                        <div className="section-heading">
                          <h2>
                            {t("本批次素材")}
                            <span>({project.media.length})</span>
                          </h2>
                          <p>{t("原文件保存在本机，点击查看。")}</p>
                        </div>
                        <div className="media-grid">
                          {project.media.map((m) => (
                            <button
                              key={m.id}
                              className="media-card"
                              onClick={() =>
                                setSource({
                                  media: m,
                                  time: 0,
                                })
                              }
                            >
                              <div>
                                <img src={m.thumbnail} alt={m.name} />
                                <span>
                                  {m.kind === "video" ? (
                                    <FileVideo size={15} />
                                  ) : (
                                    <ImageIcon size={15} />
                                  )}
                                  {m.kind === "video"
                                    ? seconds(m.duration)
                                    : t("照片")}
                                </span>
                              </div>
                              <strong>{m.name}</strong>
                              <p>
                                {m.status === "analyzed"
                                  ? t("{v0} 个人脸切片 · {v1} 个采样帧", {
                                      v0: m.detections,
                                      v1: m.sampled_frames,
                                    })
                                  : t("待分析")}
                                <small>
                                  {(m.size / 1024 / 1024).toFixed(1)} MB
                                </small>
                              </p>
                              {m.warning && <em>{t(m.warning)}</em>}
                            </button>
                          ))}
                        </div>
                        <div className="notice">
                          <AlertCircle size={17} />
                          {
                            project.faces.filter((f) => !f.usable_for_matching)
                              .length
                          }{" "}
                          {t(
                            "张低质量人脸保留为未归类，不会强行匹配。未检测到人脸的素材仍在原素材库中。",
                          )}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
      {dialogs}
      {modal === "delete" && (
        <Modal
          title={t("删除批次与人脸数据")}
          close={() => !busy && setModal(null)}
        >
          <p>
            {t(
              "将永久删除此批次的原始素材、人脸特征、分组和所有成片。已下载到其他位置的文件不受影响。",
            )}
          </p>
          <footer>
            <button onClick={() => setModal(null)}>{t("返回")}</button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api(`/projects/${project.id}`, {
                    method: "DELETE",
                  });
                  setProjects((all) => all.filter((p) => p.id !== project.id));
                  setProject(null);
                  setSelected(null);
                  setModal(null);
                })
              }
            >
              {t("确认永久删除")}
            </button>
          </footer>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {t(toast)}
        </div>
      )}
    </div>
  );
}
