// 歌姬名称归一：同一歌姬在 B 站标题/标签里有中文、日文、英文多种写法，
// 直接按字符串聚合会把同一个人的作品拆成好几份（初音未来 / 初音ミク / miku 曾各自统计）。
// 这里统一到「标准名」：中文名优先（本站为中文站），日文/英文写法作别名。
//
// 注意：
// - 只归并有把握的写法。形近但不同角色（如「绁月縁」与「结月缘」）不可合并。
// - 单例名（rin / len / luka / teto 等）在标题里极易误命中普通英文单词，
//   不单独作为识别词，只在与姓氏/前缀共现的写法（鏡音リン、巡音ルカ）里识别。
//
// ---- 关于「镜音双子」（2026-09-26 联网查证，来源：VocaWiki / Wikiwand / vocabili 官方索引）----
// 镜音铃（鏡音リン / Kagamine Rin，女，14 岁，152cm，代表物橘子，代表色 #FFA500 橘黄）
// 镜音连（鏡音レン / Kagamine Len，男，14 岁，156cm，代表物香蕉，代表色 #FFE211 明黄）
// 是 Crypton「角色主唱系列」第二作里的两位**独立角色**：CV 同为下田麻美、画师同为 KEI，
// 2007-12-27 作为一套软件同时发售。
// 开发阶段 Crypton 曾设想设定为双胞胎姐弟，但发售时为保留创作空间而**没有**写入官方设定，
// 「镜中映像」的说法同样未被官方采用；「镜音双子」属粉丝/二次设定，官方从未说明两人关系。
// vocabili 官方索引里也确实没有「镜音双子」这一条目——搜这个词会同时返回
// id=81 镜音铃 与 id=141 镜音连，两人各有独立的作品数、引擎与头像。
// 因此「镜音双子」不能归一到某一个人身上，必须**展开成两位**同时计入。

const GIRL_ALIAS = {
  洛天依: ["洛天依v4", "luo tianyi", "tianyi"],
  言和: ["言和v3", "yanhe"],
  乐正绫: ["乐正绫v3", "樂正綾", "yuezheng ling"],
  乐正龙牙: ["樂正龍牙", "yuezheng longya"],
  徵羽摩柯: ["徵羽摩柯", "摩柯"],
  墨清弦: ["墨清絃", "mo qingxian"],
  心华: ["心華", "心华v4", "xinhua"],
  星尘: ["星塵", "星尘infinity", "星尘Infinity", "stardust"],
  赤羽: ["赤羽", "chiyu"],
  苍穹: ["蒼穹", "cangqiong"],
  海伊: ["海伊", "haiyi"],
  牧心: ["牧心", "muxin"],
  诗岸: ["詩岸", "shian"],
  夏语遥: ["夏語遙", "xia yuyao"],
  初音未来: ["初音ミク", "初音miku", "hatsune miku", "miku", "初音未來"],
  镜音铃: ["鏡音リン", "鏡音鈴", "镜音rin", "kagamine rin"],
  镜音连: ["鏡音レン", "鏡音連", "镜音len", "kagamine len"],
  巡音流歌: ["巡音ルカ", "巡音luka", "巡音流歌"],
  meiko: ["MEIKO"],
  kaito: ["KAITO"],
  ia: ["IA"],
  gumi: ["GUMI", "gumi"],
  vy1: ["VY1"],
  vy2: ["VY2"],
  结月缘: ["結月ゆかり", "結月緣", "yukari"],
  重音teto: ["重音テト", "重音Teto", "重音テト"],
  音街鳗: ["音街ウナ", "音街鰻", "una"],
  歌爱雪: ["歌愛雪", "歌爱ゆき"],
  艾尔法: ["艾爾法"],
  绮萱: ["綺萱"],
  苍羽: ["蒼羽"],
  琴语: ["琴語"],
  燕音凤: ["燕音鳳"],
};

// 合称词 -> 展开成的多位歌姬。
// 这些词指的不是一个角色，而是多位角色的合称，命中时每一位都要各自计入。
// （「镜音双子」的查证结论见文件头注释；其余为同一组合称的中/日/英写法。）
const GROUP_EXPAND = {
  镜音双子: ["镜音铃", "镜音连"],
  "镜音铃·连": ["镜音铃", "镜音连"],
  镜音铃连: ["镜音铃", "镜音连"],
  "鏡音リン・レン": ["镜音铃", "镜音连"],
  "鏡音リンレン": ["镜音铃", "镜音连"],
  "鏡音鈴・連": ["镜音铃", "镜音连"],
  "镜音双子·连": ["镜音铃", "镜音连"],
  "kagamine rin/len": ["镜音铃", "镜音连"],
  "kagamine rinlen": ["镜音铃", "镜音连"],
  "rin/len": ["镜音铃", "镜音连"],
};

const GROUP_MAP = new Map();
for (const [k, v] of Object.entries(GROUP_EXPAND)) GROUP_MAP.set(k.toLowerCase(), v);

// 小写 -> 标准名（含标准名自身）
const ALIAS_MAP = new Map();
for (const [canon, aliases] of Object.entries(GIRL_ALIAS)) {
  ALIAS_MAP.set(canon.toLowerCase(), canon);
  for (const a of aliases || []) ALIAS_MAP.set(String(a).toLowerCase(), canon);
}

// 单个名称 -> 标准名（合称词不做展开，原样返回）
function canonicalGirl(name) {
  const key = String(name || "").toLowerCase();
  return ALIAS_MAP.get(key) || String(name || "");
}

// 一组名称 -> 去重后的标准名数组（保持原顺序；合称词会展开为多位）
function canonicalGirls(names) {
  const out = [];
  for (const n of names || []) {
    const key = String(n || "").toLowerCase();
    const group = GROUP_MAP.get(key);
    const list = group || [canonicalGirl(n)];
    for (const c of list) if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// 查询词 -> 待匹配的歌姬名集合。
// 搜「镜音双子」时应同时命中镜音铃和镜音连的曲子，所以查询侧也要展开。
function expandNames(names) {
  return canonicalGirls(names);
}

// 该歌姬的所有已知写法（标准名 + 别名），供搜索/匹配使用
function aliasesOf(canon) {
  return [canon, ...(GIRL_ALIAS[canon] || [])];
}

module.exports = { GIRL_ALIAS, GROUP_EXPAND, canonicalGirl, canonicalGirls, expandNames, aliasesOf };
