import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { useTranslation } from "react-i18next";

const CATS = ["song", "p", "girl", "cover"];

export default function InteractionPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [cat, setCat] = useState("song");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const list = JSON.parse(localStorage.getItem("xngschina-nominations") || "[]");
    list.push({ cat, text: text.trim(), at: Date.now(), user: user?.nickname || null });
    localStorage.setItem("xngschina-nominations", JSON.stringify(list));
    setText("");
    setSent(true);
    setTimeout(() => setSent(false), 2500);
  }

  return (
    <section className="mx-auto max-w-2xl min-w-0 space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{t("interaction.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("interaction.desc")}</p>
      </div>

      <form onSubmit={submit} className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {CATS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCat(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                cat === id
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:border-primary/30 hover:text-primary"
              }`}
            >
              {t(`interaction.cat.${id}`)}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={t("interaction.placeholder")}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {user ? t("interaction.asUser", { name: user.nickname }) : t("interaction.anonymous")}
          </span>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            {t("interaction.submit")}
          </button>
        </div>
      </form>

      {sent && (
        <p className="rounded-md bg-primary/10 px-3 py-2 text-center text-xs font-medium text-primary">
          {t("interaction.sent")}
        </p>
      )}

      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="text-sm font-medium">{t("interaction.emptyTitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("interaction.emptyDesc")}</p>
      </div>
    </section>
  );
}