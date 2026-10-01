import { Component } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { isChunkError, tryAutoReload, resetReloadCount } from "../moduleGuard.js";

// 路由分片加载失败时（React.lazy reject）不能让整棵树崩掉 —— 否则用户看到的是一片白屏，
// 连头部和导航都没了。这里拦下来：先尝试自动刷新，刷新用尽则显示可点击重试的降级卡片。
// 只包住页面区域（App.jsx 的 Suspense 外层），头部 / 底部 Tab 栏照常显示。

function ChunkErrorFallback({ error, onRetry }) {
  const { t } = useTranslation();
  const isChunk = isChunkError(error);
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-card px-6 py-16 text-center">
      <span className="text-2xl" aria-hidden="true">
        ♪
      </span>
      <p className="text-sm font-semibold">{t("common.chunkErrorTitle")}</p>
      <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
        {isChunk ? t("common.chunkErrorDesc") : String((error && error.message) || error)}
      </p>
      {/* 原始报错保留成小字，便于排障 */}
      {isChunk ? (
        <p className="max-w-md break-words text-[11px] text-muted-foreground/70">
          {String((error && error.message) || error)}
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90"
        >
          {t("common.retry")}
        </button>
        <button
          type="button"
          onClick={() => location.reload()}
          className="rounded-md border px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-accent"
        >
          {t("common.reload")}
        </button>
        <Link
          to="/"
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {t("common.backHome")}
        </Link>
      </div>
    </div>
  );
}

export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // 分片/资源类错误优先自动刷新（内部有节流与次数上限）；其余错误直接降级展示
    if (isChunkError(error) && tryAutoReload()) return;
    // eslint-disable-next-line no-console
    console.error("[ChunkErrorBoundary]", error);
  }

  retry() {
    // 用户主动重试：把自动刷新的预算重置，下一次失败仍可自动刷新
    resetReloadCount();
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return <ChunkErrorFallback error={this.state.error} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}
