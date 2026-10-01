// 手动重建榜单缓存：与 index.js 的 refreshBoards() 等价（写 board_*.json + 归档 board_archive/）。
// 改了 buildBoard 的取值逻辑后不必重启 API —— memCache 按文件 mtime 失效，写完即生效。
// 必须在 apps/api 目录下运行（dotenv 读 cwd）。
//   node scripts/refresh-boards.js            # 全部周期
//   node scripts/refresh-boards.js daily      # 只重建指定周期
const fs = require("node:fs");
const path = require("node:path");
const services = require("../src/services");

const CACHE_DIR = path.join(__dirname, "..", "cache");

function writeCache(name, obj) {
  const dest = path.join(CACHE_DIR, name);
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj), "utf8");
  fs.renameSync(tmp, dest);
}

function archiveBoard(period, data) {
  const issue = data.issue ?? "unknown";
  const dir = path.join(CACHE_DIR, "board_archive", period);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${issue}.json`);
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  fs.renameSync(tmp, dest);
}

(async () => {
  const only = process.argv[2];
  const names = only ? [only] : ["daily", "weekly", "monthly", "annual"];
  const meta = { generated_at: Date.now(), issue: {} };
  for (const name of names) {
    const t0 = Date.now();
    const r = await services.buildBoard(name);
    if (!r) {
      console.error(`[refresh] ${name} 构建失败`);
      continue;
    }
    writeCache(`board_${name}.json`, r);
    meta.issue[name] = r.issue ?? null;
    archiveBoard(name, r);
    console.log(
      `[refresh] ${name} 期号 ${r.issue} 条目 ${(r.list || []).length} 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  }
  if (!only) writeCache("meta.json", meta);
  console.log("[refresh] 完成");
})().catch((e) => {
  console.error("[refresh] 失败:", e);
  process.exit(1);
});
