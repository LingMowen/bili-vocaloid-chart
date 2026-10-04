// 引擎 logo 兜底表。
//
// 官方索引 `GET https://api.vocabili.top/v3/synthesizer/list` 对这两个引擎返回 `picture: null`，
// 官方图床 `static.vocabili.top/pictures/synthesizer/` 也没有默认图（试了 10 个候选名 × 3 种后缀
// 共 30 个地址，全部 404），所以卡片此前是空的。这里用**引擎官方渠道**的素材补齐：
//
//   Talk Ex(58)「音街ウナTalk Ex」
//     株式会社インターネット 官方角色站 https://otomachiuna.jp/ 的 Talk Ex 主视觉
//     https://otomachiuna.jp/wp-content/uploads/2024/12/TalkEX_SQ_01.png（1080×1080，©MTK / INTERNET Co., Ltd.）
//     裁出角色头部区域缩到 256×256 —— 产品没有独立的方形图标，方图里可辨识度最高的就是角色形象。
//
//   TALQu(51)
//     Haruqa 官网 https://haruqa.github.io/TALQu/ 的 favicon.ico 内嵌 256×256（PNG 段，offset 102150）
//     剥离后即官方图标本体（绿底手写体 TALQu）。官网域名在本机被 DNS 污染，素材经
//     https://cdn.jsdelivr.net/gh/haruqa/TALQu@master/docs/img/favicon.ico 取得。
//
// ⚠ 这两张是**引擎官方的产品素材**，不是我们画的，也不冒充别家 logo；仓库里留一份本地副本是为了
//    避免源站（尤其 otomachiuna.jp）在用户侧加载慢或被墙导致卡片再次空缺。若日后要改回直链，
//    只需把下面的值换成官方 URL 即可，调用方无需改动。
//
// 其余 13 种引擎的 logo 都来自官方索引的 picture 字段（远程 URL），不走这张表。

const BY_ID = {
  58: "/engines/talkex.png",
  51: "/engines/talqu.png",
};

const BY_NAME = {
  "talk ex": "/engines/talkex.png",
  talqu: "/engines/talqu.png",
};

/**
 * 取引擎卡片的图片地址：优先官方 picture，缺失时回落到本地兜底表。
 * @param {{id?: number|string, name?: string, picture?: string|null}} e /api/engines 返回的引擎条目
 * @returns {string|null} 图片地址；官方与我们都没有素材时返回 null（EntityCard 再走首字徽标）
 */
export function enginePicture(e) {
  if (!e) return null;
  if (e.picture) return e.picture;
  if (e.id != null && BY_ID[e.id]) return BY_ID[e.id];
  const key = String(e.name ?? "").trim().toLowerCase();
  return BY_NAME[key] ?? null;
}
