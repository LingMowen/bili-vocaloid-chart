// vocabili 日刊同步 CLI（必须在 apps/api 目录下运行）。
//
// 口径：**只抓日刊**（周刊/月刊/年刊由本站自算）；只管 bvid + 播放/点赞/评论/投币，
// **不取名次与分数**；日刊里库内没有的 bvid 写入待抓队列，交给下一轮 B 站采集。
//
//   node scripts/sync-vocabili.js                    # 抓日刊最新一期（约 3 次请求）
//   node scripts/sync-vocabili.js --force            # 本地已有该期也重抓
//   node scripts/sync-vocabili.js --dry              # 只看计划，不落盘
//   node scripts/sync-vocabili.js --status           # 只打印待抓队列状态
//   node scripts/sync-vocabili.js --board=weekly     # 例外：手动抓其它榜（默认不用）
const vocabiliSync = require("../src/vocabiliSync");
const pendingPool = require("../src/pendingPool");

function arg(name, def) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : def;
}
const has = (name) => process.argv.slice(2).includes(`--${name}`);

(async () => {
  if (has("status")) {
    console.log("[sync-vocabili] 待抓队列:", JSON.stringify(pendingPool.stats(), null, 1));
    return;
  }

  const opts = {
    throttle: Number(arg("throttle", 800)),
    part: arg("part", null) || null,
    dry: has("dry"),
    force: has("force"),
    mode: has("range") ? "range" : "latest",
    boards: arg("board", null) ? arg("board").split(",") : null,
  };
  console.log(
    `[sync-vocabili] ${opts.dry ? "DRY-RUN " : ""}board=${opts.boards ? opts.boards.join(",") : "daily(默认)"} throttle=${opts.throttle}ms${opts.force ? " force" : ""}`,
  );

  // 默认路径：日刊一站到底（落盘 + 四量 + 待抓队列）
  if (!opts.boards) {
    const r = await vocabiliSync.syncDaily(opts);
    console.log(
      `  daily: latest=${r.latest}${r.skipped ? "（本地已有，复用）" : "（新抓）"} 条目=${r.rows} 分区=${(r.parts || []).join("+") || "-"}`,
    );
    console.log(
      `  四量落盘 ${r.meta_written} 条（累计 ${r.meta_total}）；待抓队列 新增 ${r.pending_added}、库内已有跳过 ${r.pending_skipped_in_library}、队列重复跳过 ${r.pending_skipped_dup}，队列共 ${r.pending_total}`,
    );
    if (opts.dry) console.log("  DRY-RUN：未写入任何文件");
    return;
  }

  // 例外路径：手动抓指定榜（保留，用于排查）
  const res =
    opts.boards.length === 1
      ? [
          opts.mode === "range"
            ? await vocabiliSync.syncBoard(opts.boards[0], opts)
            : await vocabiliSync.syncLatest(opts.boards[0], opts),
        ]
      : await vocabiliSync.syncAll({ ...opts, boards: opts.boards });
  for (const r of res) {
    if (r.error) {
      console.log(`  ${r.board}: 失败 ${r.error}`);
      continue;
    }
    if (r.skipped) {
      console.log(`  ${r.board}: 最新期 ${r.latest} 跳过（${r.reason}）`);
      continue;
    }
    if (r.pending_total != null) {
      console.log(
        `  ${r.board}: latest=${r.latest} 待抓=${r.pending_total} 本批=${r.planned} 完成=${r.fetched} 失败=${r.failed} 剩余=${r.remaining} 下一期=${r.next_cursor ?? "-"}`,
      );
    } else {
      console.log(`  ${r.board}: 最新期 ${r.latest} 分区=${(r.parts || []).join("+")} 条目=${r.rows}`);
    }
  }
})().catch((e) => {
  console.error("[sync-vocabili] 异常:", e);
  process.exit(1);
});
