// 北京时间基准（UTC+8，无 DST）
//
// 为什么要单独一个模块：调度（5 分钟刷新 / 2 小时收录 / 每日榜单切期）的时间语义
// 必须是「北京时间」，不能依赖服务器本地时区 —— 换一台 UTC 机器部署时，所有
// 「每天 4 点」「每 2 小时」的判断都会整体偏移 8 小时。
//
// 不接第三方授时：本机实测（China Standard Time / BaseUtcOffset 08:00:00）与
// www.baidu.com、www.bilibili.com、www.qq.com 的 Date 响应头偏差约 2s，
// 直接用 Date.now() + 固定 +8 偏移即可，且显式偏移将来换机器也不会出错。

const BEIJING_OFFSET_MS = 8 * 3600 * 1000;

// 返回「按北京时间读挂钟」的 Date：对其调用 getUTC*() 得到的就是北京时间的各字段。
// 注意：不要用 getHours()/getDate()（那会再叠加一次本地时区偏移）。
function beijingNow(ts = Date.now()) {
  return new Date(ts + BEIJING_OFFSET_MS);
}

// 北京时间各字段；week: 0=周日 … 6=周六
function beijingParts(ts = Date.now()) {
  const d = beijingNow(ts);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    min: d.getUTCMinutes(),
    sec: d.getUTCSeconds(),
    week: d.getUTCDay(),
  };
}

function beijingHour(ts = Date.now()) {
  return beijingNow(ts).getUTCHours();
}

function beijingMinute(ts = Date.now()) {
  return beijingNow(ts).getUTCMinutes();
}

// "YYYY-MM-DD"（北京日期）
function beijingDateKey(ts = Date.now()) {
  const p = beijingParts(ts);
  const mm = String(p.m).padStart(2, "0");
  const dd = String(p.d).padStart(2, "0");
  return `${p.y}-${mm}-${dd}`;
}

// "HH:MM"（北京时间），日志用
function beijingClock(ts = Date.now()) {
  const p = beijingParts(ts);
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}:${String(p.sec).padStart(2, "0")}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  BEIJING_OFFSET_MS,
  beijingNow,
  beijingParts,
  beijingHour,
  beijingMinute,
  beijingDateKey,
  beijingClock,
  sleep,
};
