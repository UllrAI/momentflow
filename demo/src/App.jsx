import { useEffect, useRef, useState } from "react";
import {
  Mountain,
  Send,
  FolderOpen,
  MapPin,
  ReceiptText,
  Settings,
  Upload,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock3,
  ArrowLeft,
  ArrowRight,
  Link,
  Play,
  Image as ImageIcon,
  Film,
  RotateCcw,
  Download,
  ArrowUp,
  Trash2,
  ShieldCheck,
  CalendarDays,
  SlidersHorizontal,
  Bell,
  Users,
  LoaderCircle,
} from "lucide-react";
import {
  projects,
  labels,
  initialSessions,
  importedSession,
  updateSession,
  statusOf,
  canApprove,
  canDeliver,
  canView,
  imageFor,
  duration,
  clock,
} from "./model";
import { renderMontage } from "./render";

const nav = [
  { id: "today", label: "今日交付", icon: Send },
  { id: "media", label: "素材与成片", icon: FolderOpen },
  { id: "projects", label: "项目与点位", icon: MapPin },
  { id: "orders", label: "订单", icon: ReceiptText },
  { id: "settings", label: "设置", icon: Settings },
];
const getRoute = () =>
  location.hash.startsWith("#guest/")
    ? decodeURIComponent(location.hash.slice(7))
    : null;
const fileUrls = new Set();
function Status({ session }) {
  const status = statusOf(session);
  const Icon =
    status === "pending"
      ? AlertCircle
      : status === "rendering"
        ? Clock3
        : CheckCircle2;
  return (
    <span className={`status ${status}`}>
      <Icon size={14} />
      {labels[status]}
    </span>
  );
}
function Steps({ session }) {
  const count = !session.verified
    ? 2
    : session.renderedVersion !== session.version
      ? 2
      : session.delivered
        ? 4
        : 3;
  return (
    <div className="steps">
      {["已采集", "已关联", "已成片", "已交付"].map((x, i) => (
        <div key={x} className={i < count ? "done" : ""}>
          <i />
          <span>{x}</span>
        </div>
      ))}
    </div>
  );
}
function Modal({ title, close, children, wide = false }) {
  const ref = useRef(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    el.focus();
    const handler = (e) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const items = [
          ...el.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
          ),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener("keydown", handler);
    return () => {
      previous?.focus();
      el.removeEventListener("keydown", handler);
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
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭弹窗" onClick={close}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Player({ session, compact = false }) {
  return (
    <div className={`player ${compact ? "compact" : ""}`}>
      <>
        {session.video ? (
          <video
            key={`${session.id}-${session.video}`}
            controls
            playsInline
            preload="metadata"
            poster={session.clips[0]?.src || imageFor(session.project)}
            src={session.video}
            aria-label={`${session.id} 纪念短片`}
          />
        ) : (
          <img
            src={session.clips[0]?.src || imageFor(session.project)}
            alt="待生成的影片封面"
          />
        )}
      </>
      {!session.video && (
        <div className="player-note">
          <Film size={25} />
          <span>等待生成影片</span>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [sessions, setSessions] = useState(initialSessions);
  const [project, setProject] = useState(projects[0]);
  const [page, setPage] = useState("today");
  const [selected, setSelected] = useState("SX-1024-018");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [guest, setGuest] = useState(getRoute);
  const [studio, setStudio] = useState(false);
  const [toast, setToast] = useState("");
  const [renderProgress, setRenderProgress] = useState(null);
  const renderController = useRef(null);
  const [verifiedChecks, setVerifiedChecks] = useState([]);
  const [scopeCheck, setScopeCheck] = useState(false);
  const [importFiles, setImportFiles] = useState([]);
  const [importError, setImportError] = useState("");
  const [captionIndex, setCaptionIndex] = useState(0);
  const [paymentPending, setPaymentPending] = useState(false);
  const [checkoutConfirmed, setCheckoutConfirmed] = useState(false);
  const [guestPlaying, setGuestPlaying] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const selectedSession = sessions.find((s) => s.id === selected);
  const session = sessions.find((s) => s.id === guest) || selectedSession;
  const list = sessions.filter((s) => s.project === project);
  const visible = list.filter(
    (s) => filter === "all" || statusOf(s) === filter,
  );
  const notify = (text) => setToast(text);
  useEffect(() => {
    const handle = () => {
      setGuest(getRoute());
      setGuestPlaying(false);
      setDownloaded(false);
    };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(
    () => () => {
      renderController.current?.abort();
      fileUrls.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, guest, studio]);
  const mutate = (id, action) =>
    setSessions((all) =>
      all.map((s) => (s.id === id ? updateSession(s, action) : s)),
    );
  const chooseProject = (value) => {
    setProject(value);
    setSelected(sessions.find((s) => s.project === value)?.id);
    setFilter("all");
  };
  const edit = (clips) => {
    if (session.delivered) return;
    mutate(session.id, { type: "edit", clips });
  };
  const openVerify = () => {
    setVerifiedChecks([]);
    setScopeCheck(false);
    setModal("verify");
  };
  const goGuest = (s) => {
    location.hash = `guest/${encodeURIComponent(s.id)}`;
  };
  const closeModal = () => {
    if (!paymentPending) setModal(null);
  };
  async function render() {
    const target = session;
    setRenderProgress(0);
    const controller = new AbortController();
    renderController.current = controller;
    try {
      const { url: video, format } = await renderMontage(
        target.clips,
        setRenderProgress,
        controller.signal,
      );
      fileUrls.add(video);
      mutate(target.id, {
        type: "render",
        version: target.version,
        video,
        format,
      });
      notify("预览已生成，请播放检查后确认成片。");
    } catch (error) {
      notify(error.message);
    } finally {
      setRenderProgress(null);
      renderController.current = null;
    }
  }
  function importMedia() {
    const id = `DEMO-${String(sessions.length + 1).padStart(3, "0")}`;
    const clips = importFiles.length
      ? importFiles.map((file, i) => {
          const src = URL.createObjectURL(file);
          fileUrls.add(src);
          return {
            id: `${id}-${i}`,
            src,
            name: file.name,
            title: [
              "出发，一起迎着风",
              "把快乐留在山林之间",
              "这一刻，值得带走",
            ][i % 3],
          };
        })
      : [0, 1, 2].map((i) => ({
          id: `${id}-${i}`,
          src: i === 1 ? "/media/forest.jpg" : imageFor(project),
          title: ["出发，一起迎着风", "把快乐留在山林之间", "这一刻，值得带走"][
            i
          ],
          name: `SAMPLE_${i + 1}.jpg`,
        }));
    setSessions((all) => [...all, importedSession(id, project, clips)]);
    setSelected(id);
    setFilter("all");
    setPage("today");
    setStudio(false);
    setModal(null);
    notify("素材已归入新场次，请核对同行人后生成影片。");
  }
  function pickFiles(event) {
    const files = [...event.target.files];
    event.target.value = "";
    if (
      files.length > 6 ||
      files.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 15 * 1024 * 1024,
      )
    ) {
      setImportError(
        "请选择最多 6 张 JPG、PNG 或 WebP 照片，每张不超过 15 MB。",
      );
      setImportFiles([]);
      return;
    }
    setImportError("");
    setImportFiles(files);
  }
  function purchase() {
    setPaymentPending(true);
    setTimeout(() => {
      mutate(session.id, { type: "purchase" });
      setPaymentPending(false);
      setModal(null);
      notify("模拟解锁成功，可以下载纪念短片了。");
    }, 700);
  }
  function download() {
    if (!canView(session) || !session.paid) return;
    const a = document.createElement("a");
    a.href = session.video;
    a.download = `${session.id}-MomentFlow.${session.videoFormat || "mp4"}`;
    a.click();
    setDownloaded(true);
  }

  const dialogs = (
    <>
      {modal === "verify" && (
        <Modal title="核对本场次同行人" close={closeModal}>
          <p className="muted">
            {session.id} · 体验码已绑定。请按现场记录确认出镜范围。
          </p>
          <div className="verify-photo">
            <img
              src={session.clips[0]?.src || imageFor(session.project)}
              alt="本场次待核对的体验照片"
            />
          </div>
          <div className="check-list">
            {session.party.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={verifiedChecks.includes(name)}
                  onChange={(e) =>
                    setVerifiedChecks((all) =>
                      e.target.checked
                        ? [...all, name]
                        : all.filter((x) => x !== name),
                    )
                  }
                />
                <span>{name}</span>
                <small>本场次体验者</small>
              </label>
            ))}
          </div>
          <label className="scope-check">
            <input
              type="checkbox"
              checked={scopeCheck}
              onChange={(e) => setScopeCheck(e.target.checked)}
            />
            <span>
              已确认所选素材仅包含本场次参与者，并已获得相应使用和领取授权。
            </span>
          </label>
          <div className="notice">
            <ShieldCheck size={18} />
            这是人工核对演示，不进行人脸识别或身份认证。
          </div>
          <footer>
            <button onClick={closeModal}>返回</button>
            <button
              className="primary"
              disabled={
                verifiedChecks.length !== session.party.length || !scopeCheck
              }
              onClick={() => {
                mutate(session.id, { type: "verify" });
                setModal(null);
                notify("同行范围已确认，请检查影片并确认成片。");
              }}
            >
              确认同行范围
            </button>
          </footer>
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="导入体验素材" close={closeModal}>
          <p className="muted">
            将照片归入「{project}」的新场次，再核对参与者。
          </p>
          <label className="upload-zone">
            <Upload size={30} />
            <strong>选择活动照片</strong>
            <span>JPG / PNG / WebP · 最多 6 张 · 单张 ≤ 15 MB</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={pickFiles}
            />
          </label>
          {importError && (
            <p role="alert" className="error">
              {importError}
            </p>
          )}
          {importFiles.length > 0 && (
            <div className="file-list">
              {importFiles.map((f) => (
                <p key={`${f.name}-${f.lastModified}`}>
                  <ImageIcon size={15} />
                  {f.name}
                  <small>{(f.size / 1024 / 1024).toFixed(1)} MB</small>
                </p>
              ))}
            </div>
          )}
          <div className="notice">
            <ShieldCheck size={18} />
            照片仅在当前浏览器处理，不会上传。也可直接导入一组示例素材。
          </div>
          <footer>
            <button
              onClick={() => {
                setImportFiles([]);
                setImportError("");
              }}
            >
              清空选择
            </button>
            <button
              className="primary"
              disabled={!!importError}
              onClick={importMedia}
            >
              {importFiles.length
                ? `导入 ${importFiles.length} 张照片`
                : "使用示例素材"}
            </button>
          </footer>
        </Modal>
      )}
      {modal === "batch" && (
        <Modal title="交付已确认的影片" close={closeModal}>
          <p className="muted">
            仅交付当前项目中，同行范围、成片版本都已确认的场次。
          </p>
          <div className="delivery-list">
            {list.filter(canDeliver).map((s) => (
              <div key={s.id}>
                <CheckCircle2 size={18} />
                <strong>{s.id}</strong>
                <span>{s.party.length} 位体验者</span>
              </div>
            ))}
          </div>
          {!list.some(canDeliver) && (
            <div className="empty">
              <ShieldCheck />
              <h3>还没有可交付的影片</h3>
              <p>完成同行核对、生成预览及成片确认后再来。</p>
            </div>
          )}
          <footer>
            <button onClick={closeModal}>返回</button>
            <button
              className="primary"
              disabled={!list.some(canDeliver)}
              onClick={() => {
                const ready = list.filter(canDeliver);
                setSessions((all) =>
                  all.map((s) =>
                    ready.some((x) => x.id === s.id)
                      ? updateSession(s, { type: "deliver" })
                      : s,
                  ),
                );
                setSelected(ready[0].id);
                setModal(null);
                notify(`已交付 ${ready.length} 个场次，可打开游客领取页。`);
              }}
            >
              确认交付 {list.filter(canDeliver).length} 个场次
            </button>
          </footer>
        </Modal>
      )}
      {modal === "checkout" && (
        <Modal title="解锁纪念影像" close={closeModal}>
          <div className="checkout-product">
            <img src={session.clips[0].src} alt="纪念影像封面" />
            <div>
              <strong>纪念影像包</strong>
              <p>{session.id}</p>
              <b>
                ¥49 <small>示例价格</small>
              </b>
            </div>
          </div>
          <div className="notice">
            <ReceiptText size={18} />
            演示订单，不会收款；无需提供付款信息。
          </div>
          <label className="scope-check">
            <input
              type="checkbox"
              checked={checkoutConfirmed}
              onChange={(e) => setCheckoutConfirmed(e.target.checked)}
            />
            我已了解这是模拟购买。
          </label>
          <footer>
            <button disabled={paymentPending} onClick={closeModal}>
              返回
            </button>
            <button
              className="primary"
              disabled={paymentPending || !checkoutConfirmed}
              onClick={purchase}
            >
              {paymentPending ? (
                <>
                  <LoaderCircle className="spin" />
                  处理中
                </>
              ) : (
                "模拟支付成功"
              )}
            </button>
          </footer>
        </Modal>
      )}
      {modal === "package" && (
        <Modal title="纪念影像包内容" close={closeModal}>
          <div className="package-details">
            <Film />
            <h3>1 支纪念短片 + {session.clips.length} 张照片</h3>
            <p>
              短片时长 {clock(duration(session))}
              ，由当前场次所选照片生成，无声。
            </p>
            <p>解锁后可下载真实示例视频。照片可在下方逐张打开保存。</p>
            {session.clips.map((clip, i) => (
              <a
                key={clip.id}
                href={clip.src}
                download={`MomentFlow-${i + 1}.jpg`}
                className={!session.paid ? "disabled-link" : ""}
                aria-disabled={!session.paid}
                onClick={(e) => !session.paid && e.preventDefault()}
              >
                <ImageIcon size={18} />
                照片 {i + 1} · {session.paid ? "下载" : "解锁后下载"}
              </a>
            ))}
          </div>
          <footer>
            <button className="primary" onClick={closeModal}>
              知道了
            </button>
          </footer>
        </Modal>
      )}
    </>
  );

  if (guest)
    return (
      <div className="guest-shell">
        <div className="guest-demo">
          <span>游客视角 · 演示相册</span>
          <button
            onClick={() => {
              location.hash = "";
            }}
          >
            返回工作台 <ArrowRight size={13} />
          </button>
        </div>
        {!canView(sessions.find((s) => s.id === guest)) ? (
          <main className="guest-unavailable">
            <ShieldCheck size={44} />
            <h1>这份影像还未开放</h1>
            <p>影片完成核对并交付后，才能在这里领取。</p>
            <button
              onClick={() => {
                location.hash = "";
              }}
            >
              返回工作台
            </button>
          </main>
        ) : (
          <main className="guest-page">
            <header className="guest-brand">
              <img className="venue-mark" src="/media/venue.png" alt="" />
              <div>
                <strong>松野探险乐园</strong>
                <small>SONGYE ADVENTURE PARK</small>
              </div>
              <span>×</span>
              <b>MomentFlow · 拾光</b>
            </header>
            <p className="guest-intro">
              你的专属体验相册 <span>MADE FOR YOUR MOMENT</span>
            </p>
            <div className="guest-cover">
              {guestPlaying ? (
                <video
                  controls
                  autoPlay
                  playsInline
                  src={session.video}
                  poster={session.clips[0].src}
                />
              ) : (
                <>
                  <img src={session.clips[0].src} alt="松野探险体验纪念照片" />
                  <button
                    className="play-cover"
                    aria-label="播放纪念短片"
                    onClick={() => setGuestPlaying(true)}
                  >
                    <Play fill="currentColor" />
                  </button>
                  <h1>
                    这一刻，
                    <br />
                    值得带走。
                  </h1>
                  <span className="watermark">松野 · 预览</span>
                  <span className="cover-duration">
                    {clock(duration(session))}
                  </span>
                </>
              )}
            </div>
            <div className="guest-meta">
              <div>
                <CalendarDays size={17} />
                <strong>2026年10月24日 · {session.project}</strong>
              </div>
              <p>
                <MapPin size={14} />
                松野探险乐园{" "}
                <span>
                  {session.id} · {session.time}
                </span>
              </p>
            </div>
            <div className="guest-photos">
              {session.clips.slice(1, 3).map((clip, i) => (
                <img key={clip.id} src={clip.src} alt={`体验照片 ${i + 2}`} />
              ))}
            </div>
            <section className="guest-package">
              <div>
                <h2>
                  纪念影像包 <small>示例套餐</small>
                </h2>
                <strong className="price">
                  <small>¥</small>49
                </strong>
              </div>
              <h3>
                <Film size={19} />1 支纪念短片 <span>＋</span>
                <ImageIcon size={19} />
                {session.clips.length} 张照片
              </h3>
              <p>
                记录你们在山林间的精彩瞬间，
                <br />
                保留这段勇敢、快乐、并肩同行的珍贵回忆。
              </p>
              <button
                className="unlock"
                onClick={
                  session.paid
                    ? download
                    : () => {
                        setCheckoutConfirmed(false);
                        setModal("checkout");
                      }
                }
              >
                {session.paid ? (
                  <>
                    <Download />
                    下载纪念短片
                  </>
                ) : (
                  <>
                    解锁高清影像 ¥49 <ArrowRight />
                  </>
                )}
              </button>
              {session.paid && (
                <p className="purchase-success">
                  <CheckCircle2 size={15} />
                  已模拟解锁 ·{" "}
                  {downloaded
                    ? "下载已开始，可再次领取"
                    : "影像已准备好，随时保存"}
                </p>
              )}
              <div className="guest-links">
                <button onClick={() => setModal("package")}>
                  <FolderOpen size={17} />
                  查看套餐内容
                </button>
                <button
                  onClick={() =>
                    session.paid
                      ? notify("购买权益已恢复，可以重新下载。")
                      : notify("当前场次暂无模拟购买记录，请先解锁。")
                  }
                >
                  <RotateCcw size={17} />
                  恢复领取
                </button>
              </div>
              <p className="guest-footnote">
                演示影像由 AI 生成照片制作，不实际收费。
                <br />
                本页仅展示当前已交付场次，不提供身份认证或公开分享服务。
              </p>
            </section>
          </main>
        )}
        {dialogs}
        {toast && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {toast}
          </div>
        )}
      </div>
    );

  return (
    <div className={`app-shell ${studio ? "studio-shell" : ""}`}>
      <aside className="sidebar">
        <a
          className="brand"
          aria-label="MomentFlow · 拾光，返回今日交付"
          href="#"
          onClick={() => {
            setPage("today");
            setStudio(false);
          }}
        >
          <img className="brand-mark" src="/media/brand.png" alt="" />
          <div>
            <strong>MomentFlow · 拾光</strong>
            <small>让每一次体验，都被好好珍藏</small>
          </div>
        </a>
        {studio ? (
          <div className="studio-sessions">
            <button className="back" onClick={() => setStudio(false)}>
              <ArrowLeft size={15} />
              返回交付工作台
            </button>
            <div className="studio-project">
              <img src={imageFor(project)} alt={project} />
              <div>
                <strong>松野探险乐园</strong>
                <span>{project}</span>
                <small>2026-10-24 · 星期六</small>
              </div>
            </div>
            {list.map((s) => (
              <button
                key={s.id}
                className={selected === s.id ? "active" : ""}
                disabled={renderProgress !== null}
                onClick={() => {
                  setSelected(s.id);
                  setCaptionIndex(0);
                }}
              >
                <img src={s.clips[0]?.src || imageFor(s.project)} alt="" />
                <div>
                  <strong>{s.id}</strong>
                  <span>
                    {s.party.length} 名同行 · {clock(duration(s))}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <>
            {" "}
            <nav aria-label="主导航">
              {nav.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  aria-label={label}
                  className={page === id ? "active" : ""}
                  onClick={() => {
                    setPage(id);
                    setStudio(false);
                  }}
                >
                  <Icon size={21} />
                  {label}
                </button>
              ))}
            </nav>
            <div className="sidebar-scenery">
              <img src="/media/forest.jpg" alt="松林山谷风景" />
              <div>
                <span>COLLECT MOMENTS.</span>
                <strong>体验，连接更多美好的发生。</strong>
                <small>MomentFlow · 拾光</small>
              </div>
            </div>
          </>
        )}
      </aside>
      <main className="workspace">
        <div className="account">
          <span className="demo-label">交互演示</span>
          <button
            className="icon-button"
            aria-label="查看交付提醒"
            onClick={() =>
              notify(
                `当前项目有 ${list.filter((s) => !s.delivered).length} 个场次待处理。`,
              )
            }
          >
            <Bell size={19} />
          </button>
          <span className="account-divider" />
          <div className="venue-icon">
            <Mountain size={20} />
          </div>
          <div>
            <strong>松野探险乐园</strong>
            <small>运营管理员</small>
          </div>
        </div>
        <header className="page-heading">
          {studio ? (
            <>
              <button className="back" onClick={() => setStudio(false)}>
                <ArrowLeft size={16} />
                返回交付工作台
              </button>
              <h1>成片工作室</h1>
              <p>把每一次体验，变成值得回放的故事。</p>
            </>
          ) : (
            <>
              <span className="eyebrow">
                MOMENTFLOW /{" "}
                {page === "today" ? "DELIVERY" : page.toUpperCase()}
              </span>
              <h1>
                {
                  {
                    today: "今日体验交付",
                    media: "素材与成片",
                    projects: "项目与点位",
                    orders: "影像订单",
                    settings: "工作空间设置",
                  }[page]
                }
              </h1>
              <p>
                {
                  {
                    today: "从一次体验，到一份值得带走的回忆。",
                    media: "属于每个场次的瞬间，都在这里。",
                    projects: "让每个拍摄点位，与一次体验准确相连。",
                    orders: "领取权益与影像交付，清晰可追溯。",
                    settings: "为每一份回忆，设定恰当的边界。",
                  }[page]
                }
              </p>
            </>
          )}
        </header>
        {(page === "today" || page === "media") && !studio && (
          <>
            <div className="toolbar">
              <div className="date-label">
                10月24日 <span>今天</span>
                <CalendarDays size={17} />
              </div>
              <div className="select-control">
                <Mountain size={18} />
                <span>松野探险乐园</span>
              </div>
              <label className="select-control">
                <MapPin size={17} />
                <select
                  aria-label="体验项目"
                  value={project}
                  onChange={(e) => chooseProject(e.target.value)}
                >
                  {projects.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <ChevronDown size={15} />
              </label>
              <div className="toolbar-actions">
                <button
                  onClick={() => {
                    setImportFiles([]);
                    setImportError("");
                    setModal("import");
                  }}
                >
                  <Upload size={17} />
                  导入素材
                </button>
                <button className="primary" onClick={() => setModal("batch")}>
                  <Send size={17} />
                  交付已确认的影片
                </button>
              </div>
            </div>
            <div className="delivery-layout">
              <section className="session-list">
                <div className="tabs" role="tablist" aria-label="场次状态">
                  {[["all", "全部场次"], ...Object.entries(labels)].map(
                    ([key, name]) => (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={filter === key}
                        className={filter === key ? "active" : ""}
                        onClick={() => setFilter(key)}
                      >
                        {name}{" "}
                        <span>
                          (
                          {key === "all"
                            ? list.length
                            : list.filter((s) => statusOf(s) === key).length}
                          )
                        </span>
                      </button>
                    ),
                  )}
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>场次编号</th>
                        <th>开始时间</th>
                        <th>体验类型</th>
                        <th>影片时长</th>
                        <th>状态</th>
                        <th>交付进度</th>
                        <th>
                          <span className="sr-only">详情</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((s) => (
                        <tr
                          key={s.id}
                          className={selected === s.id ? "selected" : ""}
                          onClick={() => setSelected(s.id)}
                        >
                          <td>
                            <button
                              className="row-select"
                              onClick={() => setSelected(s.id)}
                            >
                              {s.id}
                            </button>
                          </td>
                          <td>{s.time}</td>
                          <td>
                            {s.party.length === 1
                              ? "单人体验"
                              : `${s.party.length} 人同行`}
                          </td>
                          <td>{clock(duration(s))}</td>
                          <td>
                            <Status session={s} />
                          </td>
                          <td>
                            <Steps session={s} />
                          </td>
                          <td>
                            <ChevronRight size={16} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!visible.length && (
                  <div className="empty">
                    <FolderOpen />
                    <h3>没有{filter === "all" ? "" : labels[filter]}的场次</h3>
                    <p>切换状态筛选，或导入新素材。</p>
                    <button onClick={() => setFilter("all")}>
                      查看全部场次
                    </button>
                  </div>
                )}
                <div className="table-foot">
                  <span>{visible.length} 个场次 · 示例日期 2026.10.24</span>
                  <span>
                    <ShieldCheck size={13} />
                    按场次私密交付
                  </span>
                </div>
              </section>
              {selectedSession && (
                <aside className="inspector">
                  <div className="inspector-heading">
                    <h2>{session.id}</h2>
                    <Status session={session} />
                  </div>
                  <p className="session-meta">
                    10月24日 {session.time}
                    <span>·</span>
                    {session.party.length} 人同行<span>·</span>
                    {clock(duration(session))}
                  </p>
                  <Player session={session} />
                  <div className="review-message">
                    <i />
                    <strong>
                      {!session.verified
                        ? "需确认本场次同行人"
                        : session.delivered
                          ? "影片已交付，等待领取"
                          : session.approvedVersion === session.version
                            ? "本场次影片已确认"
                            : "请检查并确认当前成片"}
                    </strong>
                    <p>
                      {!session.verified
                        ? "核对体验者和素材范围后，才能进入交付。"
                        : session.delivered
                          ? "游客可在专属页面预览并解锁影像。"
                          : "素材绑定、同行授权和成片审核分别确认。"}
                    </p>
                  </div>
                  <div className="inspector-actions">
                    {!session.verified ? (
                      <button className="primary" onClick={openVerify}>
                        <Users size={17} />
                        核对场次
                      </button>
                    ) : session.delivered ? (
                      <button
                        className="primary"
                        onClick={() => goGuest(session)}
                      >
                        <Link size={17} />
                        游客领取页
                      </button>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => {
                          setStudio(true);
                          setCaptionIndex(0);
                        }}
                      >
                        <Film size={17} />
                        {canApprove(session) ? "审核成片" : "生成成片"}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setStudio(true);
                        setCaptionIndex(0);
                      }}
                    >
                      <SlidersHorizontal size={16} />
                      {session.delivered ? "查看成片" : "打开工作室"}
                    </button>
                  </div>
                  <div className="sources-heading">
                    <h3>
                      素材来源 <span>({session.clips.length})</span>
                    </h3>
                    <small>
                      <CheckCircle2 size={14} />
                      体验码已绑定
                    </small>
                  </div>
                  <div className="source-grid">
                    {session.clips.slice(0, 3).map((clip, i) => (
                      <button
                        key={clip.id}
                        onClick={() => {
                          setCaptionIndex(i);
                          setStudio(true);
                        }}
                      >
                        <img src={clip.src} alt={clip.title} />
                        <strong>{clip.name}</strong>
                        <small>照片 · 片段 {i + 1}</small>
                      </button>
                    ))}
                  </div>
                  <div className="notice">
                    <Link size={20} />
                    <div>
                      <strong>体验码已绑定</strong>
                      <span>关联只确定素材归属，交付仍需确认同行范围。</span>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
        {studio && (
          <div className="studio">
            <section className="studio-main">
              <div className="studio-top">
                <div>
                  <strong>{session.id}</strong>
                  <span>
                    {session.project} · {session.party.length} 人同行
                  </span>
                </div>
                <Status session={session} />
              </div>
              <Player session={session} />
              <div className="timeline-heading">
                <h3>
                  故事片段{" "}
                  <small>{session.clips.length} 个片段 · 每段 4 秒</small>
                </h3>
                <span>照片短片 · 无声</span>
              </div>
              <div className="filmstrip">
                {session.clips.map((clip, i) => (
                  <div
                    key={clip.id}
                    className={captionIndex === i ? "selected" : ""}
                  >
                    <button
                      className="clip-pick"
                      onClick={() => setCaptionIndex(i)}
                    >
                      <img
                        src={clip.src}
                        alt={`片段 ${i + 1}：${clip.title}`}
                      />
                      <span>{clock(i * 4)} — 04s</span>
                    </button>
                    <div>
                      <small>
                        {String(i + 1).padStart(2, "0")} · {clip.title}
                      </small>
                      <button
                        disabled={
                          i === 0 ||
                          session.delivered ||
                          renderProgress !== null
                        }
                        aria-label={`前移片段 ${i + 1}`}
                        onClick={() => {
                          const clips = [...session.clips];
                          [clips[i - 1], clips[i]] = [clips[i], clips[i - 1]];
                          edit(clips);
                          setCaptionIndex(i - 1);
                        }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        disabled={
                          session.clips.length === 1 ||
                          session.delivered ||
                          renderProgress !== null
                        }
                        aria-label={`移除片段 ${i + 1}`}
                        onClick={() => {
                          edit(session.clips.filter((c) => c.id !== clip.id));
                          setCaptionIndex(0);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <label className="caption-label">
                片段 {captionIndex + 1} 字幕
                <input
                  maxLength={36}
                  value={session.clips[captionIndex]?.title || ""}
                  disabled={session.delivered || renderProgress !== null}
                  onChange={(e) =>
                    edit(
                      session.clips.map((clip, i) =>
                        i === captionIndex
                          ? { ...clip, title: e.target.value }
                          : clip,
                      ),
                    )
                  }
                />
              </label>
              <div className="notice">
                <Film size={18} />
                修改片段或字幕后，需重新生成并审核。演示在浏览器内生成真实视频，每张照片展示
                4 秒。
              </div>
            </section>
            <aside className="studio-review">
              <span className="eyebrow">BEFORE DELIVERY</span>
              <h2>交付前，最后看一眼。</h2>
              <div className="review-line">
                <CheckCircle2 />
                <div>
                  <strong>体验码已绑定</strong>
                  <p>{session.id}</p>
                </div>
              </div>
              <div className="review-line">
                {session.verified ? (
                  <CheckCircle2 />
                ) : (
                  <AlertCircle className="orange" />
                )}
                <div>
                  <strong>
                    同行范围{session.verified ? "已核对" : "待核对"}
                  </strong>
                  <p>{session.party.join("、")}</p>
                  {!session.verified && (
                    <button onClick={openVerify}>
                      现在核对 <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="review-line">
                {session.renderedVersion === session.version ? (
                  <CheckCircle2 />
                ) : (
                  <Clock3 className="orange" />
                )}
                <div>
                  <strong>
                    {session.renderedVersion === session.version
                      ? "当前版本已生成"
                      : "需要重新生成预览"}
                  </strong>
                  <p>
                    版本 {session.version} · {clock(duration(session))}
                  </p>
                </div>
              </div>
              <div className="render-actions">
                {renderProgress !== null ? (
                  <>
                    <div className="render-progress">
                      <LoaderCircle className="spin" size={18} />
                      正在生成影片 {renderProgress}%
                    </div>
                    <progress value={renderProgress} max="100" />
                    <p>请保持此页面可见，约需 {duration(session)} 秒。</p>
                    <button onClick={() => renderController.current?.abort()}>
                      取消生成
                    </button>
                  </>
                ) : (
                  <>
                    <button disabled={session.delivered} onClick={render}>
                      <Film size={17} />
                      {session.renderedVersion === session.version
                        ? "重新生成预览"
                        : "生成预览"}
                    </button>
                    <button
                      className="primary"
                      disabled={
                        !canApprove(session) ||
                        session.delivered ||
                        session.approvedVersion === session.version
                      }
                      onClick={() => {
                        mutate(session.id, { type: "approve" });
                        notify("成片已确认，可以交付。");
                      }}
                    >
                      <Check size={17} />
                      {session.approvedVersion === session.version
                        ? "成片已确认"
                        : "确认当前成片"}
                    </button>
                    <button
                      className="primary terracotta"
                      disabled={!canDeliver(session) && !session.delivered}
                      onClick={() => {
                        if (session.delivered) goGuest(session);
                        else {
                          mutate(session.id, { type: "deliver" });
                          notify("已交付，游客领取页已开放。");
                        }
                      }}
                    >
                      <Send size={17} />
                      {session.delivered ? "打开游客领取页" : "交付此影片"}
                    </button>
                  </>
                )}
              </div>
              <small className="studio-tip">
                <ShieldCheck size={14} />
                已交付影片锁定编辑，避免已购内容发生变化。
              </small>
            </aside>
          </div>
        )}
        {page === "projects" && (
          <section className="project-grid">
            {projects.map((p, i) => (
              <article key={p}>
                <img src={imageFor(p)} alt={p} />
                <div>
                  <span className="eyebrow">EXPERIENCE 0{i + 1}</span>
                  <h2>{p}</h2>
                  <p>
                    场次绑定 ·{" "}
                    {i
                      ? "赛道起点 / 林间弯道 / 终点"
                      : "出发平台 / 林间机位 / 到达平台"}
                  </p>
                  <div className="project-points">
                    <span>
                      <CheckCircle2 size={15} />3 个示例拍摄点
                    </span>
                    <span>体验码关联</span>
                  </div>
                  <button
                    onClick={() => {
                      chooseProject(p);
                      setPage("today");
                    }}
                  >
                    查看项目场次 <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
        {page === "orders" && (
          <section className="orders">
            <div className="section-title">
              <h2>模拟订单</h2>
              <span>示例套餐 ¥49 · 无实际收款</span>
            </div>
            {sessions.some((s) => s.paid) ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>场次</th>
                      <th>项目</th>
                      <th>套餐</th>
                      <th>金额</th>
                      <th>领取权益</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions
                      .filter((s) => s.paid)
                      .map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.id}</strong>
                          </td>
                          <td>{s.project}</td>
                          <td>纪念影像包</td>
                          <td>
                            ¥49 <small>模拟</small>
                          </td>
                          <td>
                            <span className="status ready">
                              <CheckCircle2 size={14} />
                              已解锁
                            </span>
                          </td>
                          <td>
                            <button onClick={() => goGuest(s)}>
                              打开领取页
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">
                <ReceiptText size={32} />
                <h3>第一份回忆，等待被带走。</h3>
                <p>
                  交付影片后，在游客领取页完成一次模拟解锁，订单会出现在这里。
                </p>
                <button onClick={() => setPage("today")}>
                  去处理今日交付 <ArrowRight size={16} />
                </button>
              </div>
            )}
          </section>
        )}
        {page === "settings" && (
          <section className="settings-panel">
            <h2>演示工作空间</h2>
            <dl>
              <div>
                <dt>机构</dt>
                <dd>松野探险乐园（虚构）</dd>
              </div>
              <div>
                <dt>交付方式</dt>
                <dd>人工核对同行 → 成片审核 → 私密领取</dd>
              </div>
              <div>
                <dt>媒体处理</dt>
                <dd>照片在浏览器内处理，不上传服务器</dd>
              </div>
              <div>
                <dt>识别与付款</dt>
                <dd>使用模拟记录；不进行人脸识别，不实际收费</dd>
              </div>
              <div>
                <dt>保存范围</dt>
                <dd>当前页面会话；刷新后恢复示例数据</dd>
              </div>
            </dl>
            <div className="notice">
              <ShieldCheck size={20} />
              本地演示不提供生产环境的认证、访问控制、订单核验或云端存储。
            </div>
            <button onClick={() => setModal("reset")}>
              <RotateCcw size={16} />
              重置演示数据
            </button>
          </section>
        )}
        {modal === "reset" && (
          <Modal title="重新开始演示" close={closeModal}>
            <p>将清除本次导入、编辑及模拟购买记录，恢复初始场次。</p>
            <footer>
              <button onClick={closeModal}>返回</button>
              <button
                className="primary"
                onClick={() => {
                  fileUrls.forEach((url) => URL.revokeObjectURL(url));
                  fileUrls.clear();
                  setSessions(initialSessions());
                  setSelected("SX-1024-018");
                  setProject(projects[0]);
                  setPage("today");
                  setFilter("all");
                  setModal(null);
                  notify("演示已重置。");
                }}
              >
                确认重置
              </button>
            </footer>
          </Modal>
        )}
        <footer className="workspace-footer">
          <span>每一次体验，都值得被好好记住。</span>
          <span>MomentFlow · 交互演示 / 照片素材与身份均为虚构</span>
        </footer>
      </main>
      {dialogs}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
