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
import { api, defaultSelection, latestExport, seconds } from "./api";

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
    org: "青禾幼儿园",
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
          <h2>{title}</h2>
          <button aria-label="关闭弹窗" className="icon" onClick={close}>
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
      {label}
    </span>
  );
}
function Empty({ icon: Icon = FolderOpen, title, text, children }) {
  return (
    <div className="empty">
      <Icon size={34} strokeWidth={1.4} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function App() {
  const [mode, setMode] = useState(
    () => localStorage.getItem("momentflow-mode") || "kindergarten",
  );
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("workbench");
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
  const scene = scenes[mode] || scenes.kindergarten;
  const person = project?.people.find((p) => p.id === selected);
  const personFaces =
    project?.faces.filter((f) => person?.face_ids.includes(f.id)) || [];
  const currentOutput = latestExport(project, selected);
  const output =
    currentOutput &&
    (!person || note === person.note) &&
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
            : latestExport(project, selected)?.segment_ids ||
              defaultSelection(data),
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
  function identity() {
    setName(person.name);
    setAuthorized(person.authorized);
    setIdentityChecked(false);
    setModal("identity");
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
        data = await api(`/projects/${data.id}/samples`, { method: "POST" });
        update(data);
        data = await api(`/projects/${data.id}/analyze`, {
          method: "POST",
          body: { sample_interval: 1 },
        });
        update(data);
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
          body: { sample_interval: interval },
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
          body: { segment_ids: selectedSegments },
        }),
      );
    });
  }
  async function approve() {
    await act(async () => {
      update(
        await api(`/projects/${project.id}/exports/${output.id}/approve`, {
          method: "POST",
          body: { reviewed },
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
      notify(`影片已向${scene.receiver}视角开放。`);
    });
  }
  async function merge() {
    await act(async () => {
      update(
        await api(`/projects/${project.id}/people/${person.id}/merge`, {
          method: "POST",
          body: { other_id: mergeId },
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
          body: { face_ids: faceSelections },
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

  const dialogs = (
    <>
      {modal === "new" && (
        <Modal title="新建素材批次" close={() => !busy && setModal(null)}>
          <p className="muted">照片、视频、人物特征和影片保存在当前电脑。</p>
          <label>
            批次名称
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={80}
            />
          </label>
          {mode === "kindergarten" && (
            <label>
              班级
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
            我有权处理这些照片与视频；涉及儿童时，已取得相应监护授权。
          </label>
          <footer>
            <button onClick={() => setModal(null)}>返回</button>
            <button
              className="primary"
              disabled={busy || !newTitle.trim() || !importConsent}
              onClick={() => createProject(false)}
            >
              创建批次
            </button>
          </footer>
        </Modal>
      )}
      {modal === "upload" && (
        <Modal title="导入照片与视频" close={() => !busy && setModal(null)}>
          <p className="muted">上传到本机处理服务，不会发送至云端识别平台。</p>
          <label className="dropzone">
            <Upload size={30} />
            <strong>选择活动照片与视频</strong>
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
            每份 ≤100 MB，视频 ≤5 分钟；每批最多 30 份、总计 ≤500
            MB。支持本地视频文件，尚未接监控直播流。
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
              返回
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
              导入 {files.length || ""} 份素材
            </button>
          </footer>
        </Modal>
      )}
      {modal === "identity" && person && (
        <Modal
          title={`核对${mode === "kindergarten" ? "儿童" : "人物"}身份与授权`}
          close={() => !busy && setModal(null)}
        >
          <p className="muted">
            以下是同一人物组的实际检测切片。请逐一检查，发现混人时先拆分。
          </p>
          <div className="modal-faces">
            {personFaces.map((f) => (
              <img
                key={f.id}
                src={f.thumbnail}
                alt="待核对人脸切片"
                loading="lazy"
              />
            ))}
          </div>
          <label>
            姓名 / 体验者称呼
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
            我已核对本组所有人脸均属于上述人物。
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            {mode === "kindergarten"
              ? "已获得监护人关于拍摄、人物关联及本儿童影像领取的相应授权。"
              : "已确认拍摄、人物关联和影像领取的相应授权。"}
          </label>
          <footer>
            <button onClick={() => setModal(null)}>返回检查</button>
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
              确认身份与授权
            </button>
          </footer>
        </Modal>
      )}
      {modal === "enroll" && (
        <Modal
          title={`登记${mode === "kindergarten" ? "儿童参考档案" : "人物参考照片"}`}
          close={() => !busy && setModal(null)}
        >
          <p className="muted">
            上传一张仅有本人、清晰正面的人脸照片。识别只在此批次内比对，不搜索外部身份库。已有聚类结果时，可以人工合并到参考档案。
          </p>
          <label>
            姓名
            <input
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            正面参考照片
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
            我已获得此人物或其监护人关于照片关联和影像领取的相应授权。
          </label>
          <footer>
            <button onClick={() => setModal(null)}>返回</button>
            <button
              className="primary"
              disabled={busy || !authorized || !name.trim() || !reference}
              onClick={enroll}
            >
              登记参考档案
            </button>
          </footer>
        </Modal>
      )}
      {modal === "approve" && (
        <Modal title="审核当前成片" close={() => !busy && setModal(null)}>
          <p className="muted">
            请先完整播放影片。只确认当前版本，之后修改素材、人物分组、姓名或记录，都需重新生成并审核。
          </p>
          <label className="checkline">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            我已检查人物身份、非目标人脸遮盖、所选片段、文字记录和接收范围，确认可以交付。
          </label>
          <div className="notice">
            <ShieldCheck size={18} />
            自动遮盖仅覆盖检测到的非目标人脸，漏检仍需人工检查。此步骤不代表系统能保证零误识别。
          </div>
          <footer>
            <button onClick={() => setModal(null)}>返回播放</button>
            <button
              className="primary"
              disabled={!reviewed || busy}
              onClick={approve}
            >
              <Check size={16} />
              审核通过
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
                <img src={source.media.url} alt="原始照片" />
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
              ? `检测时间 ${seconds(source.time || 0)} · 人脸检测置信度 ${Math.round(source.face.confidence * 100)}%（不是身份正确概率）`
              : "原始素材预览，仅当前本地工作空间可访问。"}
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
          <span>本地演示 · {scene.receiver}视角</span>
          <button onClick={() => setRecipient(null)}>
            <ArrowLeft size={13} />
            返回工作台
          </button>
        </div>
        <main className="recipient-page">
          <div className="recipient-brand">
            <Leaf size={25} />
            <strong>
              {mode === "kindergarten" ? "拾光成长" : "MomentFlow · 拾光"}
            </strong>
            <span>{project.class_name || "专属体验影像"}</span>
          </div>
          {deliveredOutput?.delivered && deliveredOutput?.approved ? (
            <>
              <p className="eyebrow">A LITTLE STORY, JUST FOR YOU</p>
              <h1>
                {deliveredPerson.name}的{scene.output}
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
                    ? "老师想和你分享"
                    : "这次体验，值得回放"}
                </h3>
                <p>
                  {deliveredOutput.note ||
                    "属于你的精彩瞬间，都收在这份小小的回忆里。"}
                </p>
              </div>
              <a
                className="button primary download"
                href={deliveredOutput.claim_url}
                download
              >
                <Download size={18} />
                保存{scene.output}
                <ArrowRight size={18} />
              </a>
              <p className="recipient-foot">
                真实生成的 720p MP4 · 无声 · {seconds(deliveredOutput.duration)}
                <br />
                本页为本机领取演示，暂不支持跨设备分享。
              </p>
            </>
          ) : (
            <Empty
              icon={ShieldCheck}
              title="这份影片还未开放"
              text="老师完成当前版本审核并交付后，才可以领取。"
            />
          )}
        </main>
        {error && (
          <div className="toast error" role="alert">
            {error}
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
          aria-label="拾光，返回工作台"
          onClick={() => setTab("workbench")}
        >
          {mode === "kindergarten" ? (
            <Leaf size={34} />
          ) : (
            <Mountain size={34} />
          )}
          <div>
            <strong>{scene.brand}</strong>
            <small>
              {mode === "kindergarten"
                ? "让每个童年都被看见"
                : "让每一次体验，都被好好珍藏"}
            </small>
          </div>
        </a>
        <div className="scene-switch">
          <button
            disabled={disabled}
            aria-label="体验场景"
            className={mode === "adventure" ? "active" : ""}
            onClick={() => switchScene("adventure")}
          >
            <Mountain size={14} />
            体验
          </button>
          <button
            disabled={disabled}
            aria-label="幼儿园场景"
            className={mode === "kindergarten" ? "active" : ""}
            onClick={() => switchScene("kindergarten")}
          >
            <GraduationCap size={15} />
            幼儿园
          </button>
        </div>
        <nav aria-label="主导航">
          {[
            ["workbench", "批次交付工作台", Send],
            ["people", scene.people, Users],
            ["media", "素材库", FolderOpen],
            ["settings", "设置与处理说明", Settings],
          ].map(([id, title, Icon]) => (
            <button
              key={id}
              aria-label={title}
              className={tab === id ? "active" : ""}
              disabled={busy}
              onClick={() => setTab(id)}
            >
              <Icon size={19} />
              <span>{title}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={18} />
          <strong>识别与素材，留在本机。</strong>
          <p>
            照片、视频和人物特征
            <br />
            不发送给云端识别服务。
          </p>
          <small>MomentFlow / LOCAL STUDIO</small>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div>
            <span>{scene.org}</span>
            {project?.class_name && (
              <>
                <ChevronRight size={13} />
                <strong>{project.class_name}</strong>
              </>
            )}
          </div>
          <span className="local-tag">
            <i />
            本地真实处理
          </span>
        </header>
        <section className="page-heading">
          <div>
            <p className="eyebrow">
              {mode === "kindergarten"
                ? "MOMENTFLOW / GROWING TOGETHER"
                : "MOMENTFLOW / PERSONAL HIGHLIGHTS"}
            </p>
            <h1>
              {tab === "media"
                ? "把精彩，汇聚在一起。"
                : tab === "people"
                  ? "每一张面孔，都值得被认真确认。"
                  : tab === "settings"
                    ? "工作空间与处理边界"
                    : scene.title}
            </h1>
            <p>{scene.description}</p>
          </div>
          <div className="heading-actions">
            <button
              disabled={!health || disabled}
              onClick={() => {
                setNewTitle(
                  mode === "kindergarten" ? "本周成长周记" : "体验纪念片",
                );
                setImportConsent(false);
                setModal("new");
              }}
            >
              <Plus size={16} />
              新建批次
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
              导入素材
            </button>
          </div>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button onClick={() => (health ? setError("") : boot())}>
              {health ? "关闭" : "重新连接"}
            </button>
          </div>
        )}
        {health && (!health.models_ready || !health.ffmpeg_ready) && (
          <div className="error-banner">
            <AlertCircle size={18} />
            <span>
              本地识别模型或 FFmpeg 尚未准备好，请执行 npm run setup。
            </span>
          </div>
        )}
        {!health && !error && (
          <Empty
            icon={LoaderCircle}
            title="正在连接本地处理服务"
            text="加载工作空间与识别模型状态。"
          />
        )}
        {health && (
          <>
            <div className="batch-toolbar">
              <label>
                <FolderOpen size={17} />
                <select
                  aria-label="当前素材批次"
                  value={project?.id || ""}
                  disabled={disabled}
                  onChange={(e) => {
                    const data = projects.find((p) => p.id === e.target.value);
                    if (data) {
                      update(data);
                      setFilter("all");
                    }
                  }}
                >
                  <option value="" disabled>
                    选择素材批次
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
                {stats.photos} 张照片 <i />
                {stats.videos} 段视频
              </span>
              {project && (
                <div className="batch-actions">
                  <label className="sampling">
                    抽帧间隔
                    <select
                      aria-label="抽帧间隔"
                      disabled={disabled || project.faces.length > 0}
                      value={
                        project.faces.length
                          ? project.sample_interval
                          : interval
                      }
                      onChange={(e) => setIntervalValue(Number(e.target.value))}
                    >
                      <option value="0.5">0.5 秒</option>
                      <option value="1">1 秒</option>
                      <option value="2">2 秒</option>
                    </select>
                  </label>
                  <button
                    disabled={
                      disabled ||
                      !project.media.some((m) => m.status !== "analyzed") ||
                      !health.models_ready
                    }
                    onClick={analyze}
                  >
                    <ScanFace size={16} />
                    开始人物识别
                  </button>
                </div>
              )}
            </div>
            {running && (
              <div className="job-panel" role="status">
                <LoaderCircle className="spin" size={21} />
                <div>
                  <strong>{project.job.stage}</strong>
                  <progress value={project.job.progress} max="100" />
                </div>
                <span>{project.job.progress}%</span>
                <button
                  onClick={() =>
                    act(() =>
                      api(`/projects/${project.id}/cancel`, { method: "POST" }),
                    )
                  }
                  disabled={busy}
                >
                  取消任务
                </button>
              </div>
            )}
            {project?.job?.status === "failed" && (
              <div className="error-banner" role="alert">
                <AlertCircle size={18} />
                <span>{project.job.error}</span>
                <small>保留已导入素材，可以重试。</small>
              </div>
            )}
            {!project ? (
              <div className="welcome">
                <div>
                  <span className="eyebrow">START WITH A REAL MOMENT</span>
                  <h2>
                    {mode === "kindergarten" ? (
                      <>
                        把散落的日常，
                        <br />
                        收成每个孩子的成长故事。
                      </>
                    ) : (
                      <>
                        一场体验，很多镜头。
                        <br />
                        让回忆，找到它的主人。
                      </>
                    )}
                  </h2>
                  <p>
                    导入真实照片与视频，检测人脸、聚成不同人物，
                    <br />
                    核对身份后，生成每个人自己的纪念片。
                  </p>
                  <div>
                    <button
                      className="primary"
                      disabled={busy || !health.models_ready}
                      onClick={() => createProject(true)}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                      打开{scene.sample}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setImportConsent(false);
                        setModal("new");
                      }}
                    >
                      从自己的素材开始
                    </button>
                  </div>
                  <small>
                    {mode === "kindergarten"
                      ? "示例儿童为 AI 虚构。示例视频由照片合成；识别与成片仍真实运行。"
                      : "示例含 AI 照片和 MIT 授权的 OpenCV 真人动态视频，不使用预制聚类结果。"}
                  </small>
                </div>
                <img
                  src={
                    mode === "kindergarten"
                      ? "/samples/kindergarten/blocks.jpg"
                      : "/media/zipline.jpg"
                  }
                  alt={
                    mode === "kindergarten"
                      ? "三位虚构儿童在教室搭积木"
                      : "两位虚构体验者在松林滑索平台"
                  }
                />
              </div>
            ) : (
              <>
                {(tab === "workbench" || tab === "people") && (
                  <>
                    <div className="summary-line">
                      <span>
                        <b>{project.people.length}</b> 个人物组
                        <i>·</i>
                        <em>{stats.pending} 份待核对</em>
                        <i>·</i>
                        {stats.delivered} 份已交付
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
                        登记参考档案
                      </button>
                    </div>
                    <div className="delivery-grid">
                      <section className="people-panel">
                        <div
                          className="filter-tabs"
                          role="tablist"
                          aria-label="人物状态"
                        >
                          {[
                            ["all", "全部人物"],
                            ["pending", "待核对"],
                            ["confirmed", "已确认"],
                            ["delivered", "已交付"],
                          ].map(([id, title]) => (
                            <button
                              role="tab"
                              aria-selected={filter === id}
                              className={filter === id ? "active" : ""}
                              key={id}
                              onClick={() => setFilter(id)}
                            >
                              {title}
                            </button>
                          ))}
                        </div>
                        <div className="people-table-header">
                          <span>
                            {mode === "kindergarten"
                              ? "幼儿 / 人物组"
                              : "人物组"}
                          </span>
                          <span>来源切片</span>
                          <span>状态</span>
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
                              onClick={() => setSelected(p.id)}
                            >
                              <span className="person-identity">
                                <img src={faces[0]?.thumbnail} alt="" />
                                <span>
                                  <strong>{p.name}</strong>
                                  <small>
                                    {p.face_count} 个出镜切片
                                    {faces.some((f) => f.reference)
                                      ? " · 已登记参考照"
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
                                      alt="出镜人脸切片"
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
                                ? "这个状态下还没有人物"
                                : running
                                  ? "正在从真实素材中寻找面孔"
                                  : "先让镜头里的面孔，相聚在一起。"
                            }
                            text={
                              project.media.length
                                ? "点击“开始人物识别”，系统会保留出镜时间与来源。识别不到的人脸不会被强行命名。"
                                : "先导入活动照片、视频，或使用一组示例素材。"
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
                                        { method: "POST" },
                                      ),
                                    ),
                                  )
                                }
                              >
                                导入示例素材
                              </button>
                            )}
                          </Empty>
                        )}
                        <div className="panel-footer">
                          <ShieldCheck size={13} />
                          <span>聚类只关联人物，不代替身份与授权核对。</span>
                        </div>
                      </section>
                      <section className="detail-panel">
                        {person ? (
                          <>
                            <header className="person-heading">
                              <img
                                src={face?.thumbnail}
                                alt={`${person.name}人脸切片`}
                              />
                              <div>
                                <h2>{person.name}</h2>
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
                                      segments[0]?.thumbnail || face?.thumbnail
                                    }
                                    alt="待生成集锦的素材封面"
                                  />
                                  <div>
                                    <Film size={26} />
                                    <strong>
                                      {person.confirmed
                                        ? `准备好${scene.output}的片段，再生成预览。`
                                        : "先核对人物，再生成专属集锦。"}
                                    </strong>
                                    <span>
                                      此处将播放从原始素材实际生成的 MP4
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="detail-actions">
                              <button
                                className={!person.confirmed ? "primary" : ""}
                                disabled={disabled}
                                onClick={identity}
                              >
                                <Users size={16} />
                                {person.confirmed
                                  ? "重新核对人物"
                                  : "核对人物与授权"}
                              </button>
                              <button
                                disabled={disabled}
                                onClick={() => setCorrecting(!correcting)}
                              >
                                <Scissors size={16} />
                                {correcting ? "结束纠错" : "纠正分组"}
                              </button>
                            </div>
                            <div className="section-heading">
                              <h3>
                                人脸切片 <span>({personFaces.length})</span>
                              </h3>
                              <small>点击查看原始来源</small>
                            </div>
                            <div className="face-strip">
                              {personFaces.map((f) => (
                                <div className="face-cell" key={f.id}>
                                  {correcting ? (
                                    <label>
                                      <input
                                        type="checkbox"
                                        aria-label={`选择人脸 ${f.id}`}
                                        checked={faceSelections.includes(f.id)}
                                        onChange={(e) =>
                                          setFaceSelections((all) =>
                                            e.target.checked
                                              ? [...all, f.id]
                                              : all.filter((id) => id !== f.id),
                                          )
                                        }
                                      />
                                      <img
                                        src={f.thumbnail}
                                        alt="待纠正的人脸切片"
                                      />
                                    </label>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        const media = project.media.find(
                                          (m) => m.id === f.media_id,
                                        );
                                        if (media)
                                          setSource({
                                            media,
                                            face: f,
                                            time: f.timestamp,
                                          });
                                        else notify("这是授权登记的参考照片。");
                                      }}
                                    >
                                      <img
                                        src={f.thumbnail}
                                        alt={`${f.reference ? "参考照" : `出镜 ${seconds(f.timestamp)}`}人脸切片`}
                                      />
                                    </button>
                                  )}
                                  <small>
                                    {f.reference
                                      ? "参考照"
                                      : seconds(f.timestamp)}
                                  </small>
                                </div>
                              ))}
                            </div>
                            {personFaces.length > 60 && (
                              <p className="hint">
                                可横向滚动查看全部切片。人物组共{" "}
                                {personFaces.length} 张，核对完整来源后再确认。
                              </p>
                            )}
                            {correcting && (
                              <div className="correction-box">
                                <strong>
                                  把误归的人脸拆出，或合并重复人物。
                                </strong>
                                <p>
                                  同一帧同时出现的不同人脸不能合并。纠错后需重新确认人物与成片。
                                </p>
                                <button
                                  disabled={
                                    disabled ||
                                    !faceSelections.length ||
                                    faceSelections.length === personFaces.length
                                  }
                                  onClick={split}
                                >
                                  <Split size={15} />
                                  将选中 {faceSelections.length} 张拆为新人物
                                </button>
                                <div>
                                  <select
                                    aria-label="合并另一人物组"
                                    value={mergeId}
                                    onChange={(e) => setMergeId(e.target.value)}
                                  >
                                    <option value="">选择要合并的人物组</option>
                                    {project.people
                                      .filter((p) => p.id !== person.id)
                                      .map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.name} · {p.face_count} 个出镜切片
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    disabled={!mergeId || disabled}
                                    onClick={merge}
                                  >
                                    <Merge size={15} />
                                    合并
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className="section-heading">
                              <h3>
                                {mode === "kindergarten"
                                  ? "本周精彩片段"
                                  : "个人出镜片段"}{" "}
                                <span>({segments.length})</span>
                              </h3>
                              <span>
                                {selectedSegments.length} 段已选 ·{" "}
                                {seconds(selectedDuration)}
                              </span>
                            </div>
                            <div className="segments-list">
                              {segments.map((s) => (
                                <label
                                  className={`segment ${selectedSegments.includes(s.id) ? "selected" : ""}`}
                                  key={s.id}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={disabled}
                                    checked={selectedSegments.includes(s.id)}
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
                                  <img src={s.thumbnail} alt="片段来源缩略图" />
                                  <span>
                                    <strong>{s.name}</strong>
                                    <small>
                                      {s.kind === "video" ? (
                                        <>
                                          <FileVideo size={11} />
                                          原视频 {s.start.toFixed(1)}–
                                          {s.end.toFixed(1)} 秒
                                        </>
                                      ) : (
                                        <>
                                          <ImageIcon size={11} />
                                          活动照片 · 展示 3 秒
                                        </>
                                      )}
                                      {s.other_faces > 0 && " · 含其他出镜人脸"}
                                    </small>
                                  </span>
                                  <button
                                    type="button"
                                    className="icon"
                                    aria-label={`预览片段 ${s.id}`}
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
                                尚未找到此人物的活动素材。参考照片仅用于身份比对，不会放入集锦。
                              </p>
                            )}
                            {selectedSegments.length > 1 && (
                              <div className="sequence">
                                <strong>成片顺序</strong>
                                {selectedSegments.map((id, i) => (
                                  <span key={id}>
                                    <small>
                                      {i + 1}.{" "}
                                      {segments.find((s) => s.id === id)?.name}
                                    </small>
                                    <button
                                      aria-label={`前移已选片段 ${i + 1}`}
                                      className="icon"
                                      disabled={i === 0 || disabled}
                                      onClick={() =>
                                        setSelections((all) => {
                                          const next = [...selectedSegments];
                                          [next[i - 1], next[i]] = [
                                            next[i],
                                            next[i - 1],
                                          ];
                                          return { ...all, [selected]: next };
                                        })
                                      }
                                    >
                                      <ArrowUp size={13} />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <label className="teacher-note">
                              {mode === "kindergarten"
                                ? "老师的活动记录"
                                : "这份回忆的记录"}
                              <textarea
                                value={note}
                                maxLength={500}
                                disabled={disabled}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder={
                                  mode === "kindergarten"
                                    ? "写下你实际观察到的活动与细节。文字由老师确认，不自动推断孩子的能力或性格。"
                                    : "写下关于这次体验的简短记录。"
                                }
                              />
                              <small>
                                {note.length}/500 · 会展示给{scene.receiver}
                              </small>
                            </label>
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
                                {output ? "重新生成集锦" : "生成专属集锦"}
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
                                  ? "当前版本已审核"
                                  : "审核当前成片"}
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
                                  ? "已交付"
                                  : `交付${scene.receiver}`}
                              </button>
                              {output?.delivered && (
                                <button onClick={() => setRecipient(person.id)}>
                                  <ArrowRight size={16} />
                                  {scene.receiver}领取页
                                </button>
                              )}
                            </div>
                            <div className="notice">
                              <ShieldCheck size={17} />
                              <p>
                                成片为 720p
                                无声视频，直接使用原视频动态画面。逐帧遮盖检测到的非目标人脸；仍需人工复核，不能保证零漏检。
                              </p>
                            </div>
                          </>
                        ) : (
                          <Empty
                            icon={Leaf}
                            title="选一个人物，看看属于他的瞬间。"
                            text="识别完成后，左侧会出现实际检测到的人物组。"
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
                        本批次素材 <span>({project.media.length})</span>
                      </h2>
                      <p>原文件保存在本机，点击查看。</p>
                    </div>
                    <div className="media-grid">
                      {project.media.map((m) => (
                        <button
                          key={m.id}
                          className="media-card"
                          onClick={() => setSource({ media: m, time: 0 })}
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
                                : "照片"}
                            </span>
                          </div>
                          <strong>{m.name}</strong>
                          <p>
                            {m.status === "analyzed"
                              ? `${m.detections} 个人脸切片 · ${m.sampled_frames} 个采样帧`
                              : "待分析"}
                            <small>
                              {(m.size / 1024 / 1024).toFixed(1)} MB
                            </small>
                          </p>
                          {m.warning && <em>{m.warning}</em>}
                        </button>
                      ))}
                    </div>
                    <div className="notice">
                      <AlertCircle size={17} />
                      {
                        project.faces.filter((f) => !f.usable_for_matching)
                          .length
                      }{" "}
                      张低质量人脸保留为未归类，不会强行匹配。未检测到人脸的素材仍在原素材库中。
                    </div>
                  </section>
                )}
                {tab === "settings" && (
                  <section className="settings-panel">
                    <h2>真实运行的处理链路</h2>
                    <div className="pipeline-steps">
                      {[
                        "本地照片 / 视频",
                        "抽帧与人脸检测",
                        "特征提取与聚类",
                        "人工核对人物",
                        "原片剪辑与遮盖",
                        "审核与专属领取",
                      ].map((text, i) => (
                        <div key={text}>
                          <span>0{i + 1}</span>
                          <strong>{text}</strong>
                        </div>
                      ))}
                    </div>
                    <dl>
                      <div>
                        <dt>识别引擎</dt>
                        <dd>YuNet 检测 + SFace 特征 · 仅此批次内匹配</dd>
                      </div>
                      <div>
                        <dt>成片引擎</dt>
                        <dd>FFmpeg + 逐帧人脸检测 · 720p MP4 · 无声</dd>
                      </div>
                      <div>
                        <dt>存储位置</dt>
                        <dd>
                          当前电脑的
                          .momentflow-data，刷新后仍保留。人物特征不返回前端，也不发送云端。
                        </dd>
                      </div>
                      <div>
                        <dt>聚类边界</dt>
                        <dd>
                          相似度不是身份正确概率。低清、侧脸、遮挡和儿童外观相近都可能导致漏检、错分或分散，必须人工核对。
                        </dd>
                      </div>
                      <div>
                        <dt>领取边界</dt>
                        <dd>
                          本地签名会话隔离项目；家长视角用于演示审核后的领取，尚未接入真实监护账号、邀请和跨设备交付。
                        </dd>
                      </div>
                      <div>
                        <dt>还未接入</dt>
                        <dd>
                          监控实时流、多模态事件理解、自动成长评价、云端存储、真实账号体系和真实支付。
                        </dd>
                      </div>
                    </dl>
                    <button
                      className="danger"
                      disabled={disabled}
                      onClick={() => setModal("delete")}
                    >
                      <X size={16} />
                      删除本批次及人脸数据
                    </button>
                  </section>
                )}
              </>
            )}
          </>
        )}
        <footer className="workspace-footer">
          <span>让每一个属于你的瞬间，都被好好记住。</span>
          <span>本地处理 · 教师/运营人工审核 · MomentFlow</span>
        </footer>
      </main>
      {dialogs}
      {modal === "delete" && (
        <Modal title="删除批次与人脸数据" close={() => !busy && setModal(null)}>
          <p>
            将永久删除此批次的原始素材、人脸特征、分组和所有成片。已下载到其他位置的文件不受影响。
          </p>
          <footer>
            <button onClick={() => setModal(null)}>返回</button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api(`/projects/${project.id}`, { method: "DELETE" });
                  setProjects((all) => all.filter((p) => p.id !== project.id));
                  setProject(null);
                  setSelected(null);
                  setModal(null);
                })
              }
            >
              确认永久删除
            </button>
          </footer>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
