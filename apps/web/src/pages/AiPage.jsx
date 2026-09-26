import { useState } from "react";
import { useAuth } from "../auth.jsx";
import { useTranslation } from "react-i18next";

export default function AiPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);

  function ask(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setRows((r) => [...r, { role: "me", text: q.trim() }]);
    setRows((r) => [
      ...r,
      {
        role: "ai",
        text: t("ai.aiReply"),
      },
    ]);
    setQ("");
  }

  return (
    <section className="mx-auto w-full max-w-4xl min-w-0 space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">{t("ai.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("ai.desc")}</p>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("ai.emptyHint")}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className={`flex ${r.role === "me" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed ${
                    r.role === "me"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-muted"
                  }`}
                >
                  {r.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={ask} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={user ? t("ai.inputPlaceholderUser", { name: user.nickname }) : t("ai.inputPlaceholder")}
          className="min-w-0 flex-1 rounded-xl border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          {t("ai.send")}
        </button>
      </form>
    </section>
  );
}