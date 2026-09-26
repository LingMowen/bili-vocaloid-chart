#!/usr/bin/env bash
# ============================================================
# xngschina — 一键备份（git 提交）
#
# 用法：
#   bash scripts/backup.sh "feat: 歌手详情页对齐参考站"
#   bash scripts/backup.sh            # 不给消息则自动生成时间戳消息
#
# 约定：
#   - 每次「重大更新」都要跑一次，形成可回溯的提交点
#   - .git 位于仓库根目录（E 盘），git 临时目录指向 E:\DevCache\git-tmp
#   - 绝不写入 C 盘
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# git 的临时文件也放到 E 盘，避免污染 C 盘
export TMPDIR="E:/DevCache/git-tmp"
export TMP="E:/DevCache/git-tmp"
export TEMP="E:/DevCache/git-tmp"
mkdir -p "$TMPDIR"

MSG="${1:-chore: 备份 $(date '+%Y-%m-%d %H:%M:%S')}"

if [ -z "$(git status --porcelain)" ]; then
  echo "[backup] 工作区无变更，跳过提交。"
  exit 0
fi

echo "[backup] 变更概览："
git status --short | head -30
echo "[backup] 统计：$(git status --porcelain | wc -l) 个文件有变动"

git add -A
git commit -q -m "$MSG"

echo "[backup] 已提交：$(git log --oneline -1)"
echo "[backup] 仓库位置：$(git rev-parse --git-dir)  （应位于 E 盘）"
