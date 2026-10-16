// 外部图片 URL 的协议归一。
//
// 背景（2026-10-16 云端控制台报错）：
//
//	Mixed Content: The page at 'https://vocaloid.ciallo.ltd/...' was loaded over HTTPS,
//	but requested an insecure element 'http://i0.hdslb.com/bfs/face/....jpg'
//
// 站点是 HTTPS，但 B 站返回的部分头像 URL 是 http，浏览器会拦截。
//
// 实测数据（apps/api/cache/library.json，2026-10-16）：
//   pic        : 27541 条**全部** https（采集时转过）
//   owner.face : **1286 条是 http**  ← 漏转
//   staff.face : **989 条是 http**   ← 漏转
//
// 为什么漏了：采集时只对 pic 做了 `.replace(/^http:\/\//, "https://")`，
// owner.face 与 staff.face 直接透传了 B 站的原始值。
//
// 处理策略：抽成统一函数，采集写入时调用 —— 这样库内数据本身就是干净的，
// 不需要每个 API 出口各转一遍（出口有十几处，容易再漏）。

/**
 * 把 http:// 升级为 https://。
 *
 * 只改协议，不动其余部分 —— B 站的 i0/i1/i2.hdslb.com 与 static.vocabili.top
 * 都支持 https（实测可正常访问）。
 *
 * 其他情况原样返回：已是 https、协议相对（//host/path）、data:/blob:、空串。
 */
function toHttps(u) {
  const s = String(u == null ? "" : u);
  if (!s) return s;
  if (s.startsWith("https://")) return s;
  if (s.startsWith("http://")) return "https://" + s.slice(7);
  if (s.startsWith("//")) return "https:" + s;
  return s;
}

/** 头像 URL 归一（owner.face / staff.face）。 */
function faceToHttps(u) {
  return toHttps(u);
}

/** 封面 URL 归一（pic / picture / thumbnail）。 */
function picToHttps(u) {
  return toHttps(u);
}

module.exports = { toHttps, faceToHttps, picToHttps };
