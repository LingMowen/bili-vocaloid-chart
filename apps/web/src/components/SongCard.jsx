import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { fmt } from "../api.js";

// 统计页结果卡片（对齐 vocabili /stats 的卡片样式）。
// 结构：group 容器 + aspect-video 封面 + 排名角标（左上）+ 排序指标角标（右下）
//      + hover 出现的外链按钮（右上）+ 标题/歌姬/P主 三行信息。
// 角标配色与原站一致：前三名分别金/银/铜，其余半透明黑。
const RANK_STYLE = (rank) => {
  if (rank === 1) return "bg-yellow-500 text-white";
  if (rank === 2) return "bg-gray-400 text-white";
  if (rank === 3) return "bg-amber-600 text-white";
  return "bg-black/50 text-white";
};

// 角标显示的值随当前排序字段变化（对齐原站 be() 的 switch）。
// 上榜次数类显示「N 次」，发布时间显示日期，其余显示数值。
function metricBadge(item, orderBy) {
  switch (orderBy) {
    case "pubdate":
      return item.pubdate ? fmtDateOnly(item.pubdate) : "";
    case "daily_count":
      return item._daily_count != null ? `${item._daily_count}次` : "";
    case "weekly_count":
      return item._weekly_count != null ? `${item._weekly_count}次` : "";
    case "view":
    case "favorite":
    case "coin":
    case "like":
    case "danmaku":
    case "reply":
    case "share":
      return fmt(item[orderBy] ?? 0);
    default:
      return fmt(item.view ?? 0);
  }
}

function fmtDateOnly(sec) {
  const d = new Date(Number(sec) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function singerNames(item) {
  const g = item.girls || [];
  if (!Array.isArray(g)) return "";
  // girls 可能是字符串数组，也可能是 [{name}] 形式
  return g
    .map((x) => (typeof x === "string" ? x : x && (x.name || x.canonical || "")))
    .filter(Boolean)
    .join(" / ");
}

function producerName(item) {
  const owner = item.owner;
  if (owner && typeof owner === "object") return owner.name || "";
  return typeof owner === "string" ? owner : "";
}

export default function SongCard({ item, rank, orderBy }) {
  const girls = singerNames(item);
  const producer = producerName(item);
  const badge = metricBadge(item, orderBy);

  return (
    <div className="group relative border bg-card transition-shadow hover:shadow-lg">
      <Link to={`/video/${item.aid}`} className="block">
        <div className="relative overflow-hidden rounded-t-lg bg-muted aspect-video">
          {item.pic ? (
            <img
              src={item.pic}
              alt={item.title || ""}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : null}
          {/* 排名角标 */}
          <div
            className={`pointer-events-none absolute left-3 top-3 rounded-lg px-2 py-1 text-sm font-bold ${RANK_STYLE(rank)}`}
          >
            {rank}
          </div>
          {/* 排序指标角标 */}
          {badge ? (
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg bg-primary px-2.5 py-1 text-sm font-semibold text-primary-foreground shadow-lg">
              {badge}
            </div>
          ) : null}
          {/* 跳转 B 站原视频（hover 出现） */}
          {item.bvid ? (
            <a
              href={`https://www.bilibili.com/video/${item.bvid}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={item.bvid}
              className="absolute right-3 top-3 z-10 rounded-lg bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        <div className="p-3">
          <p className="truncate text-sm font-semibold" title={item.title || ""}>
            {item.title}
          </p>
          {girls ? (
            <p className="mt-1 truncate text-xs text-muted-foreground" title={girls}>
              {girls}
            </p>
          ) : null}
          {producer ? (
            <p className="truncate text-xs text-muted-foreground" title={producer}>
              {producer}
            </p>
          ) : null}
        </div>
      </Link>
    </div>
  );
}