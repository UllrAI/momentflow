// Render a real, silent photo montage locally. No media leaves the browser.
export async function renderMontage(clips, onProgress, signal) {
  if (signal?.aborted) throw new Error("已取消成片");
  if (!globalThis.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)
    throw new Error("当前浏览器不支持本地成片，请使用最新版 Chrome 或 Edge。");
  const images = await Promise.all(
    clips.map(
      (clip) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("照片读取失败，请重新导入。"));
          img.src = clip.src;
        }),
    ),
  );
  const canvas = document.createElement("canvas");
  if (signal?.aborted) throw new Error("已取消成片");
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext("2d");
  ctx.scale(4 / 3, 4 / 3);
  const stream = canvas.captureStream(24);
  const mimeType = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("浏览器缺少可用的视频编码器。");
  }
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 1800000,
  });
  const chunks = [];
  let frame,
    aborted = false;
  return new Promise((resolve, reject) => {
    const finish = () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((t) => t.stop());
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      aborted = true;
      if (recorder.state !== "inactive") recorder.stop();
    };
    signal?.addEventListener("abort", abort, { once: true });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      finish();
      reject(new Error("成片失败，请重试。"));
    };
    recorder.onstop = () => {
      finish();
      if (aborted) reject(new Error("已取消成片"));
      else
        resolve({
          url: URL.createObjectURL(new Blob(chunks, { type: mimeType })),
          format: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
        });
    };
    const start = performance.now();
    const total = clips.length * 4000;
    function draw(now) {
      const elapsed = Math.min(now - start, total - 1);
      const index = Math.floor(elapsed / 4000);
      const img = images[index];
      const zoom = 1 + ((elapsed % 4000) / 4000) * 0.045;
      const scale = Math.max(960 / img.width, 540 / img.height) * zoom;
      ctx.drawImage(
        img,
        (960 - img.width * scale) / 2,
        (540 - img.height * scale) / 2,
        img.width * scale,
        img.height * scale,
      );
      ctx.fillStyle = "#062b24b8";
      ctx.fillRect(0, 424, 960, 116);
      ctx.fillStyle = "#fff";
      ctx.font = "28px sans-serif";
      ctx.fillText(clips[index].title, 38, 478, 860);
      ctx.font = "14px sans-serif";
      ctx.fillText("MomentFlow · 拾光 | 松野探险乐园 · 演示影像", 38, 514);
      onProgress(Math.min(100, Math.round(((now - start) / total) * 100)));
      if (now - start >= total) recorder.stop();
      else frame = requestAnimationFrame(draw);
    }
    recorder.start();
    draw(start);
  });
}
