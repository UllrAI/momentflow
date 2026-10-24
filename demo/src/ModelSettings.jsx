import { t } from "./i18n";
import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Plug, ShieldCheck } from "lucide-react";
import { api } from "./api";
export function ModelSettings({ reportError }) {
  const [config, setConfig] = useState(null);
  const [model, setModel] = useState("openai/gpt-6-luna");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    api("/model-config")
      .then((data) => {
        setConfig(data);
        setModel(data.model);
      })
      .catch((error) => reportError(error.message));
  }, [reportError]);
  async function save(remove = false) {
    setBusy(true);
    setMessage("");
    try {
      const data = await api("/model-config", {
        method: "PUT",
        body: {
          model,
          ...(remove
            ? {
                api_key: "",
              }
            : key
              ? {
                  api_key: key,
                }
              : {}),
        },
      });
      setConfig(data);
      setKey("");
      setMessage(
        remove ? "API Key 已移除。" : "配置已保存在本机，Key 不会返回浏览器。",
      );
    } catch (error) {
      reportError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setMessage("");
    try {
      await api("/model-config/test", {
        method: "POST",
      });
      setMessage("连接成功，模型支持结构化响应。视觉分析将在选定人物后发起。");
    } catch (error) {
      reportError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="model-settings">
      <div className="section-heading">
        <h2>
          <Plug size={20} />
          {t("多模态模型")}
        </h2>
        <span>{config?.configured ? t("已保存 Key") : t("待配置")}</span>
      </div>
      <p>
        {t(
          "通过 OpenRouter 调用 Luna，分析候选画面、挑选片段并起草周记。每次分析前会单独确认发送范围。",
        )}
      </p>
      <label>
        {t("视觉模型")}
        <select
          value={model}
          onChange={(event) => setModel(event.target.value)}
          disabled={busy}
        >
          {(config?.models || [model]).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        OpenRouter API Key
        <input
          type="password"
          value={key}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setKey(event.target.value)}
          placeholder={
            config?.configured
              ? t("已保存；留空保留，填写可替换")
              : t("在此填写 API Key，仅保存在本机")
          }
          disabled={busy}
        />
      </label>
      <div className="model-actions">
        <button className="primary" onClick={() => save()} disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <ShieldCheck size={15} />
          )}
          {t("保存配置")}
        </button>
        <button
          onClick={test}
          disabled={
            busy ||
            !config?.configured ||
            Boolean(key) ||
            model !== config?.model
          }
        >
          {t("验证连接")}
        </button>
        {config?.configured && (
          <button onClick={() => save(true)} disabled={busy}>
            {t("移除 Key")}
          </button>
        )}
      </div>
      {message && (
        <p className="inline-success" role="status">
          <CheckCircle2 size={16} />
          {t(message)}
        </p>
      )}
      <small>
        {t(
          "Key 不写入代码、localStorage 或 Git。分析会将抽取的候选画面发送至 OpenRouter 及 OpenAI；人物特征和参考档案留在本机。检测到的其他人脸会先遮盖，但仍需检查漏检。原声只用于本地成片，不上传分析。",
        )}
      </small>
    </section>
  );
}
