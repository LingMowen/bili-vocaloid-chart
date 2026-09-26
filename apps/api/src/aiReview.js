const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const progress = require("./progress");

const CACHE_DIR = path.join(__dirname, "..", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "ai_review.json");

let _cache = null;
function loadCache() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) || {};
  } catch (e) {
    _cache = {};
  }
  return _cache;
}

function saveCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const tmp = CACHE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(_cache), "utf8");
  fs.renameSync(tmp, CACHE_FILE);
}

const PROMPT = `判断这个 B 站视频是否属于"虚拟歌姬演唱的歌曲"。

虚拟歌姬包括：洛天依、初音未来、镜音铃、镜音连、诗岸、言和、星尘、乐正绫、心华、赤羽、重音teto、巡音流歌、GUMI 等，由 VOCALOID / UTAU / Synthesizer V / CeVIO / NEUTRINO 等歌声合成软件合成的演唱。

以下情况都不算（不通过）：
- 真人演唱
- AI 换声/AI 翻唱（ACE、so-vits-svc、RVC 等，把真人或其他歌声替换成歌姬声线）
- 仅 PV / 手书 / MMD / 动画 / 舞蹈
- 合集 / 串烧 / 歌单 / 盘点 / 搬运转载
- 纯音乐 / 伴奏 / 钢琴或乐器演奏 / 音游谱面
- 直播回放 / 教程 / 杂谈 / 资讯 / 科普 / 介绍 / 纪录片

注意：标题或标签提到虚拟歌姬名字，不代表就是歌曲。如果是关于歌姬的介绍、科普、杂谈、访谈、纪录片、回顾，而不是一首歌，必须回复 0。

只回复一个数字：1=通过收录，0=不通过。不要输出其他任何内容。`;

// 可轮询的模型列表（优先第一个，429/故障时切换下一个）
// thinking: false 表示该模型不支持 thinking 参数（如 Kimi 用 thinking:{type:"none"} 会 400）
const MODELS = [
  { name: "step-3.7-flash", thinking: true },
  { name: "DeepSeek-V4-Flash", thinking: true },
  { name: "Kimi-K2.6", thinking: false },
];

const _queue = [];
let _running = 0;
let _lastReqAt = 0;
const MAX_CONCURRENCY = 1;
// API 限额：300 分钟最多 600 次 → 平均 30s/次。设为 30s 确保不超限。
const MIN_INTERVAL = 30 * 1000;

// 单次请求（不带 429 重试逻辑，交给上层轮询模型）
async function callOnce(model, messages) {
  const base = config.aiReview.base.replace(/\/$/, "");
  const payload = {
    model: model.name,
    messages,
    max_tokens: 300,
    temperature: 0,
  };
  // 推理型模型关闭思考，避免 max_tokens 被推理占满导致最终答案为空
  if (model.thinking) payload.thinking = { type: "none" };
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aiReview.key}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 429) {
    throw Object.assign(new Error("AI 429"), { status: 429 });
  }
  if (!res.ok) throw new Error(`AI ${res.status} ${res.statusText}`);
  const body = await res.json();
  const content = String(body?.choices?.[0]?.message?.content || "").trim();
  return { content };
}

// 总开关：AI_REVIEW_ENABLED=false 时整体停用（不请求上游、不缓存）
function enabled() {
  return !!config.aiReview.enabled;
}

// 带模型轮询的 AI 调用：从 MODELS 依次尝试，429/故障换下一个
async function callAI(messages) {
  if (!enabled()) throw new Error("AI审核已关闭（AI_REVIEW_ENABLED=false）");
  let lastErr = null;
  for (const model of MODELS) {
    try {
      const out = await callOnce(model, messages);
      return { model: model.name, ...out };
    } catch (e) {
      lastErr = e;
      console.warn(`[aiReview] 模型 ${model.name} 失败: ${e.message}，切换下一模型…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr || new Error("所有模型均失败");
}

// 并发受限的审核调用
function runTask(fn) {
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    pump();
  });
}

function pump() {
  while (_running < MAX_CONCURRENCY && _queue.length) {
    const { fn, resolve, reject } = _queue.shift();
    _running++;
    const wait = Math.max(0, _lastReqAt + MIN_INTERVAL - Date.now());
    _lastReqAt = Date.now() + wait;
    setTimeout(() => {
      fn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          _running--;
          pump();
        });
    }, wait);
  }
}

// 审核单个视频。返回 { pass, reason }。AI 无法判定时保守拒绝（fail-closed）。
async function check(aid, ctx) {
  if (!enabled()) {
    progress.emit("ai", { aid: String(aid), action: "skipped", reason: "AI审核已关闭" });
    return { pass: true, reason: "AI审核已关闭" };
  }
  if (!config.aiReview.base || !config.aiReview.key) {
    progress.emit("ai", { aid: String(aid), action: "skipped", reason: "AI未配置" });
    return { pass: true, reason: "AI未配置" };
  }
  const cache = loadCache();
  const key = String(aid);
  if (cache[key]) {
    progress.emit("ai", { aid: key, action: "cache-hit", pass: cache[key].pass });
    progress.bumpStat("aiCacheHit");
    return cache[key];
  }

  let result;
  try {
    result = await runTask(async () => {
      const user = [
        `标题：${ctx.title || ""}`,
        `标签：${(ctx.tags || []).join("、")}`,
        `简介：${String(ctx.desc || "").slice(0, 300)}`,
        `时长：${ctx.duration || 0}秒`,
      ].join("\n");
      progress.emit("ai", { aid: key, action: "calling", title: ctx.title });
      const out = await callAI([
        { role: "system", content: PROMPT },
        { role: "user", content: user },
      ]);
      progress.bumpStat("aiApiCalls");
      progress.emit("ai", { aid: key, action: "result", model: out.model, content: out.content });
      const c = out.content;
      // 提取 1/0 判定（模型可能输出 "1" / "0" / 带说明）
      const m = /(^|\D)([01])(\D|$)/.exec(c);
      if (m) {
        const pass = m[2] === "1";
        if (pass) progress.bumpStat("aiPass"); else progress.bumpStat("aiReject");
        return { pass, reason: pass ? "通过" : c.slice(0, 60) };
      }
      // 无明确数字/空内容：无法判定时保守拒绝，避免杂谈/非歌曲漏网
      progress.bumpStat("aiReject");
      return { pass: false, reason: `AI无法判定: ${c.slice(0, 60) || "空"}` };
    });
  } catch (e) {
    progress.bumpStat("errors");
    progress.emit("ai", { aid: key, action: "error", message: e.message });
    console.warn(`[aiReview] ${aid} 审核失败: ${e.message}`);
    // fail-closed：AI 故障时拒绝收录，交给人工/下次采集复核
    result = { pass: false, reason: "AI故障" };
  }

  // 仅缓存「模型确实给出了判定」的结果。
  // AI 全模型故障属瞬时问题，若写入缓存，故障期间被 fail-closed 拒绝的歌曲会永久留在拒绝名单
  // （下一轮直接命中缓存不再重试），因此故障结果不落盘，留待后续采集轮次重新审核。
  if (result.reason !== "AI故障") {
    cache[key] = result;
    saveCache();
  }
  return result;
}

module.exports = { check, loadCache, callAI, runTask };