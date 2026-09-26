import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Calculator,
  ChevronDown,
  ExternalLink,
  Info,
  LineChart,
  Medal,
  MessageSquare,
  Music4,
  Search,
  Sparkles,
  Tags,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

// 区块头：原站为「h-9 w-9 圆角图标 + h2 text-xl font-bold tracking-tight」
function SectionHead({ icon: Icon, title }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
    </div>
  );
}

// 折叠面板：原站为 details + summary + 有序列表
function Accordion({ groups, colored }) {
  return (
    <div className="divide-y rounded-xl border">
      {groups.map((g, i) => (
        <details key={g.name} className="group border-b last:border-b-0" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted/40">
            <div className="flex items-center gap-2.5">{g.name}</div>
            <ChevronDown
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="border-t bg-muted/5 px-4 py-3">
            {colored ? (
              <ul className="space-y-3 text-base leading-relaxed">
                {g.items.map((it) => (
                  <li key={it.name}>
                    <div className="space-y-0.5">
                      <div className="font-semibold" style={it.color ? { color: it.color } : undefined}>
                        {it.name}
                      </div>
                      <div className="text-base leading-relaxed text-foreground/90">{it.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed text-muted-foreground marker:font-semibold marker:text-primary/50">
                {g.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ol>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

const FEATURE_ICONS = [
  Trophy,
  BarChart3,
  Music4,
  LineChart,
  Search,
  Calculator,
  Medal,
  Users,
  Zap,
  MessageSquare,
  Tags,
  Sparkles,
];

export default function AboutPage() {
  const { t } = useTranslation();
  const links = t("about.links", { returnObjects: true }) || [];
  const aboutBody = t("about.aboutBody", { returnObjects: true }) || [];
  const features = t("about.features", { returnObjects: true }) || [];
  const rules = t("about.rules", { returnObjects: true }) || [];
  const formula = t("about.formula", { returnObjects: true }) || [];
  const achievements = t("about.achievements", { returnObjects: true }) || [];
  const friends = t("about.friends", { returnObjects: true }) || [];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-20">
      {/* ===== 头部 ===== */}
      <section className="mb-14 text-center">
        <h1 className="mb-3 text-4xl font-extrabold tracking-tight sm:text-5xl">{t("about.siteName")}</h1>
        <p className="mx-auto mb-6 max-w-lg text-balance text-base text-muted-foreground">{t("about.slogan")}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {links.map((l) => (
            <a
              key={l.name}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              {l.name}
            </a>
          ))}
        </div>
      </section>

      {/* ===== 关于项目 ===== */}
      <section className="mb-14">
        <SectionHead icon={Info} title={t("about.aboutTitle")} />
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {aboutBody.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* ===== 平台功能 ===== */}
      <section className="mb-14">
        <SectionHead icon={Sparkles} title={t("about.featuresTitle")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const Icon = FEATURE_ICONS[i] || Sparkles;
            const inner = (
              <>
                <div className="mb-2 flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-bold">{f.name}</h3>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </>
            );
            return f.to ? (
              <Link
                key={f.name}
                to={f.to}
                className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/20"
              >
                {inner}
              </Link>
            ) : (
              <div key={f.name} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/20">
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== 收录规则 ===== */}
      <section className="mb-14">
        <SectionHead icon={Music4} title={t("about.rulesTitle")} />
        <Accordion groups={rules} />
      </section>

      {/* ===== 计分公式 ===== */}
      <section className="mb-14">
        <SectionHead icon={Calculator} title={t("about.formulaTitle")} />
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{t("about.formulaDesc")}</p>
        <Accordion groups={formula} />
      </section>

      {/* ===== 成就定义 ===== */}
      <section className="mb-14">
        <SectionHead icon={Medal} title={t("about.achievementsTitle")} />
        <Accordion groups={achievements} colored />
      </section>

      {/* ===== 友情链接 ===== */}
      <section className="mb-14">
        <SectionHead icon={ExternalLink} title={t("about.friendsTitle")} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {friends.map((f) => (
            <a
              key={f.name}
              href={encodeURI(f.url)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-primary/20"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate text-sm font-medium">{f.name}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
