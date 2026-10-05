const config = require("./config");

let _sdkPromise = null;
function sdk() {
  if (!_sdkPromise) {
    _sdkPromise = import("@aemeath-projects/bilibili");
  }
  return _sdkPromise;
}

let _clientPromise = null;
let _wbiInit = null;

async function ensureWbi(client) {
  if (_wbiInit) return _wbiInit;
  try {
    const res = await client.get("/x/web-interface/nav", {}, "cookie");
    const wbi = res?.data?.wbi_img;
    if (wbi && wbi.img_url && wbi.sub_url) {
      const { WbiSigner } = await sdk();
      const signer = WbiSigner.fromNav(wbi.img_url, wbi.sub_url);
      client.wbiSigner = signer;
    }
  } catch (e) {
    console.error(`[bili] wbi 初始化失败: ${e.message}`);
  }
  _wbiInit = true;
  return _wbiInit;
}

async function getClient() {
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    const { createClient, Credential } = await sdk();
    const client = createClient();
    const cookieStr = config.bilibiliCookie;
    if (cookieStr) {
      try {
        client.setCredential(Credential.fromCookie(cookieStr));
      } catch (e) {
        console.error(`[bili] credential 解析失败: ${e.message}`);
      }
    }
    await ensureWbi(client);
    return client;
  })();
  return _clientPromise;
}

let lastReqAt = 0;
async function throttle(ms = 150) {
  const now = Date.now();
  const wait = lastReqAt + ms - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReqAt = Date.now();
}

async function call(fn) {
  await throttle();
  return fn();
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

/**
 * 取单个稿件详情。
 * @param {{aid?:number, bvid?:string}} idParam 二选一，SDK 的 /x/web-interface/view 两个都收
 */
async function fetchVideo(idParam) {
  const client = await getClient();
  const { getVideoInfo, getVideoPages, getVideoTags } = await sdk();

  const view = await call(() => getVideoInfo(client, idParam));
  if (!view || view.code !== 0) {
    return { ok: false, code: view?.code ?? -1, message: view?.message ?? "request failed" };
  }
  const data = view.data;
  // 修 bug：下面 getVideoTags/getVideoPages 用的 aid 此前从未定义（ReferenceError），
  // 导致 tags/pages 永远抓不到 → collector 的 tagHit() 只能靠标题判定，收录率被低估。
  // idParam 可能是 {aid} 也可能是 {bvid}，统一用详情返回的 aid（bvid 场景也能拿到）。
  const aid = data.aid ?? idParam.aid ?? null;

  let tags = [];
  let pages = [];
  try {
    const tagsRes = await call(() => getVideoTags(client, { aid }));
    if (tagsRes?.code === 0) tags = tagsRes.data || [];
  } catch (e) {
    console.error(`[bili] tags 失败: ${e.message}`);
  }
  try {
    const pagesRes = await call(() => getVideoPages(client, { aid }));
    if (pagesRes?.code === 0) pages = pagesRes.data || [];
  } catch (e) {
    console.error(`[bili] pages 失败: ${e.message}`);
  }

  const out = pick(data, [
    "aid", "bvid", "title", "pic", "duration", "pubdate",
    "ctime", "desc", "copyright", "cid", "tname",
  ]);
  out.owner = pick(data.owner || {}, ["mid", "name", "face"]);
  out.stat = pick(data.stat || {}, [
    "view", "danmaku", "reply", "favorite", "coin", "share", "like", "his_rank",
  ]);
  out.pages = pages.map((p) => pick(p, ["page", "part", "duration", "cid"]));
  out.tags = tags.map((t) => pick(t, ["tag_id", "tag_name"]));
  out.staff = (data.staff || []).map((s) => pick(s, ["mid", "name", "title", "follower", "face"]));
  // 新版富文本简介：部分稿件 desc 为空而 desc_v2 有内容，拼接 raw_text 兜底
  if (!out.desc && Array.isArray(data.desc_v2) && data.desc_v2.length) {
    out.desc = data.desc_v2.map((n) => n?.raw_text || "").join("").trim();
  }
  return { ok: true, data: out };
}

/**
 * 只取一个稿件的 stat（播放/点赞/投币/收藏/分享/评论/弹幕）——5 分钟刷新专用。
 *
 * 与 fetchVideo 的区别：只发 1 次 /x/web-interface/view，不拉 tags / pages。
 * fetchVideo 每条目 3 请求，5 分钟一轮刷几百条会直接撞风控；刷新只需要 stat，
 * tags/pages 是收录时才需要的静态信息，刷新阶段不必重取。
 *
 * @param {number} aid
 * @returns {Promise<{ok:boolean, code?:number, message?:string, data?:object}>}
 */
async function fetchStat(aid) {
  const client = await getClient();
  const { getVideoInfo } = await sdk();
  try {
    const view = await call(() => getVideoInfo(client, { aid }));
    if (!view || view.code !== 0) {
      return { ok: false, code: view?.code ?? -1, message: view?.message ?? "request failed" };
    }
    const data = view.data;
    return {
      ok: true,
      data: {
        aid: data.aid ?? aid,
        bvid: data.bvid || "",
        duration: data.duration || 0,
        pubdate: data.pubdate || 0, // 秒级，与库内条目一致，不乘 1000
        stat: pick(data.stat || {}, [
          "view", "danmaku", "reply", "favorite", "coin", "share", "like", "his_rank",
        ]),
      },
    };
  } catch (e) {
    // SDK 的响应拦截器对 code!==0 直接抛异常（不是返回对象），这里统一收敛成 ok:false
    return { ok: false, code: e?.code ?? -1, message: e?.message || String(e) };
  }
}

async function member(mid) {
  const client = await getClient();
  const { getUserInfo, getUserStat } = await sdk();

  let relData = null;
  let accData = null;
  let accCode = -1;
  let accMessage = "";

  try {
    const rel = await call(() => getUserStat(client, { mid }));
    if (rel?.code === 0) relData = pick(rel.data, ["follower", "following"]);
  } catch (e) {
    console.error(`[bili] relation 失败: ${e.message}`);
  }

  try {
    const acc = await call(() => getUserInfo(client, { mid }));
    accCode = acc?.code ?? -1;
    accMessage = acc?.message ?? "";
    if (acc?.code === 0) {
      const d = acc.data;
      accData = {
        mid: d.mid,
        name: d.name,
        face: d.face,
        sign: d.sign,
        level: d.level,
        official: d.official?.title,
        follower: d.follower ?? relData?.follower,
      };
    }
  } catch (e) {
    console.error(`[bili] member 失败: ${e.message}`);
  }

  return {
    ok: true,
    data: {
      mid,
      relation: relData,
      member: accData,
      member_code: accCode,
      member_message: accMessage,
    },
  };
}

const video = (aid) => fetchVideo({ aid });
const videoByBvid = (bvid) => fetchVideo({ bvid });

const stat = (aid) => fetchStat(aid);

module.exports = { video, videoByBvid, stat, member, getClient };
