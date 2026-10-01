// B 站视频号换算：BV ↔ av（纯本地计算，B 站公开算法，不发网络请求）
const BV_DATA = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";
const BV_XOR = 23442827791579n;
const BV_MASK = 2251799813685247n;
const BV_BASE = 58n;

function bv2av(bvid) {
  const s = String(bvid || "").trim();
  if (!/^BV[0-9A-Za-z]{10}$/.test(s)) return null;
  const a = Array.from(s);
  [a[3], a[9]] = [a[9], a[3]];
  [a[4], a[7]] = [a[7], a[4]];
  let tmp = 0n;
  for (const ch of a.slice(3)) {
    const idx = BV_DATA.indexOf(ch);
    if (idx < 0) return null;
    tmp = tmp * BV_BASE + BigInt(idx);
  }
  return Number((tmp & BV_MASK) ^ BV_XOR);
}

function isBvid(v) {
  return /^BV[0-9A-Za-z]{10}$/.test(String(v || "").trim());
}

module.exports = { bv2av, isBvid, BV_DATA };
