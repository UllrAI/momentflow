import { useSyncExternalStore } from "react";
import en from "./messages.en.json" with { type: "json" };
import zh from "./messages.zh.json" with { type: "json" };

let locale =
  typeof window === "undefined"
    ? "zh"
    : window.localStorage.getItem("momentflow-language") === "en"
      ? "en"
      : "zh";
const listeners = new Set();
export const getLocale = () => locale;
export function setLocale(value) {
  if (!["zh", "en"].includes(value)) return;
  locale = value;
  if (typeof window !== "undefined")
    window.localStorage.setItem("momentflow-language", value);
  if (typeof document === "undefined") return;
  document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
  document.title =
    value === "zh" ? "MomentFlow · 拾光" : "MomentFlow · Personal stories";
  listeners.forEach((listener) => listener());
}
export function useLocale() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLocale,
    () => "zh",
  );
}

if (typeof document !== "undefined") setLocale(locale);

// Source messages are translation keys; activity names and user text stay untouched.
export function translate(message, language = locale, values = {}) {
  if (message === null || message === undefined) return "";
  const source = String(message);
  let result = (language === "en" ? en : zh)[source] ?? source;
  if (language === "en" && result === source) {
    result = source.replace(/^待命名人物\s*(.*)$/, "Person $1");
    const progress = source.match(/^检测与特征提取 · (.+) · ([\d.]+)s$/);
    if (progress) result = `Finding people · ${progress[1]} · ${progress[2]}s`;
    if (source.startsWith("Luna 视觉分析")) result = "Finding story highlights";
    if (source.startsWith("原片剪辑与人脸遮盖")) result = "Creating your film";
    if (source.startsWith("原片动态剪辑")) result = "Creating your film";
    const provider = source.match(/^OpenRouter：(.+)（(\d+)）。$/);
    if (provider)
      result = `OpenRouter: ${{ "API Key 无效": "Invalid API key", 账户额度不足: "Insufficient credits", 请求频率受限: "Too many requests", 服务请求失败: "Request failed" }[provider[1]] || "Request failed"} (${provider[2]}).`;
  }
  return result.replace(/\{(\w+)\}/g, (match, name) =>
    values[name] === undefined ? match : String(values[name]),
  );
}
export const t = (message, values) => translate(message, locale, values);

export function quantity(count, unit, language = locale) {
  const singular = {
    张照片: "photo",
    段视频: "video",
    个人物组: "group",
    个出镜切片: "appearance",
  };
  const label =
    language === "en" && count === 1
      ? singular[unit]
      : translate(unit, language).trim();
  return `${count}${language === "en" ? " " : ""}${label}`;
}
