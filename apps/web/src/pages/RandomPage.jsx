// 「随机看看」分类随机中心 —— 对齐参考文件 17-random.html
// 卡片点击 → /api/random?type=xxx → 后端返回 url，直接导航（不预先抽好、不做假数据）
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Shuffle, List, Music, Mic, User, Radio, Upload } from "lucide-react";
import { api } from "../api.js";

// 顺序与参考页一致：排行榜 / 歌曲 / P主 / 歌手 / 引擎 / UP主
const CARDS = [
  { key: "rank", icon: List },
  { key: "song", icon: Music },
  { key: "producer", icon: User },
  { key: "singer", icon: Mic },
  { key: "engine", icon: Radio },
  { key: "up", icon: Upload },
];

export default function RandomPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const roll = useMutation({
    mutationFn: (type) => api(`/api/random?type=${type}`, { silent: true }),
    onSuccess: (d) => {
      if (d?.url) navigate(d.url);
    },
  });

  return (
    <section className="mx-auto flex min-h-[70dvh] w-full max-w-2xl items-center px-4 py-10">
      <div className="w-full">
        {/* 标题区：参考页为 mb-6 容器（内部还有移动端「返回」按钮，本站导航已提供，不重复） */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">{t("random.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("random.desc")}</p>
        </div>

        {/* 全部随机：从所有类别里随机一个页面 */}
        <button
          type="button"
          disabled={roll.isPending}
          onClick={() => roll.mutate("all")}
          className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition hover:border-primary/40 hover:bg-accent/40 disabled:cursor-wait disabled:opacity-60"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center">
            <Shuffle className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">{t("random.all")}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{t("random.allDesc")}</div>
          </div>
        </button>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CARDS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              disabled={roll.isPending}
              onClick={() => roll.mutate(key)}
              className="flex min-h-24 flex-col items-start justify-between rounded-xl border bg-card p-3 text-left transition hover:border-primary/30 hover:bg-accent/40 disabled:cursor-wait disabled:opacity-60"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-semibold">{t(`random.kind_${key}`)}</div>
                <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {t(`random.kind_${key}Desc`)}
                </div>
              </div>
            </button>
          ))}
        </div>

        {roll.isError && (
          <p className="mt-3 text-xs text-destructive">{roll.error?.message || t("random.rolling")}</p>
        )}
      </div>
    </section>
  );
}
