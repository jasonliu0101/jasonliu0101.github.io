/* ═══════════════════════════════════════════════════════════════════════
   PPA 播放介面原型 — 學員端
   ─────────────────────────────────────────────────────────────────────
   一句話：把「全班在哪裡倒回去重看」當成訊號，讓 AI 助教知道該在哪一秒出現。

   為什麼是重播、不是暫停：
     暫停有雜訊 —— 接電話、去倒水、被主管叫走，都會按暫停。
     重播只有一個意思 ——「我剛剛沒聽懂」。基線低、峰值尖，訊噪比 17×。

   一條動線：
     1  重播熱力圖 — 486 人的倒帶行為疊在進度條上，峰值 = 卡關點
     2  AI 助教    — 播到峰值就出現，解說直接攤開
     3  即時投票    — 順手測一題，然後看見「全班都錯在同一個地方」
     4  整理筆記    — 重點 / 名詞 / 數字 / 你倒帶過的地方 / 知識挑戰
     5  精華 Reels  — AI 把卡關點剪成 14–30 秒直式短片
     6  主動推播    — 依卡關點 + 內容語意排回訪
   ═══════════════════════════════════════════════════════════════════════ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const fmt = s => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const md = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

let D;
const state = {
  shown:     new Set(),  // 這一輪「經過」已經彈過的熱點（離開範圍就清掉 → 再經過會再彈）
  myReplays: [],         // 這次 session 使用者自己的重播
  polled:    {},         // 投票紀錄 {hotspotId: 選了第幾個}
  reelIdx:   0,
};

/* ═════════════════════════════ Toast ═════════════════════════════ */
function toast(html, { em = '✦', ai = false, ms = 3400 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (ai ? ' ai' : '');
  el.innerHTML = `<span class="em">${em}</span><span>${html}</span>`;
  $('#toasts').append(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  }, ms);
}

/* ═════════════════════════════ 啟動 ═════════════════════════════ */
(async function init() {
  D = await (await fetch('data/course.json')).json();
  const v = $('#video');

  $('#mTitle').textContent  = `${D.course.unit} ${D.course.title}`;
  $('#mSeries').textContent = D.course.series;
  $('#mPlan').textContent   = D.course.plan;
  $('#mDate').textContent   = D.course.publishedAt;
  $('#mViews').textContent  = D.course.views.toLocaleString();
  $('#tDur').textContent    = fmt(D.course.duration);
  $('#lgN').textContent     = D.cohort.n;
  $('#tocN').textContent    = `(${D.chapters.length})`;
  $('#reelsN').textContent  = D.clips.length;
  $('#aiNote').innerHTML    = `你上次看到 <b>${fmt(D.me.lastPosition)}</b>，還剩 ${Math.round(D.course.duration - D.me.lastPosition)} 秒`;

  buildHeat();
  buildMarks();
  buildToc();
  wireTheme();
  wirePlayer(v);
  wireCoach(v);
  wireGloss(v);
  wireNotes(v);
  wireReels(v);
  wirePush(v);
  wireTutor(v);

  const iv = D.hotspots.filter(h => h.intervene).length;
  toast(`已載入 <b>${D.cohort.n}</b> 位學員的重播資料 · 找到 <b>${iv}</b> 個卡關點`, { ai: true, ms: 4200 });

  // 從課前測驗推薦點進來的話，打個招呼（動線可感）
  const from = new URLSearchParams(location.search);
  if (from.get('from') === 'quiz') {
    const rec = from.get('rec');
    setTimeout(() => toast(
      rec ? `從測驗推薦來的：<b>${rec}</b> — 這裡用這堂示範課帶你走一遍`
          : `從課前測驗來的 — 開始今天的學習`,
      { em: '🎯', ms: 5000 }), 900);
  }

  demoJump(v);
})();

/* ═════════════════════════════ 主題（跨 app 聯動）═════════════════════════════
   三個 app 共用 localStorage key「ppa-theme」。切換時：寫 localStorage、更新網址、
   換 icon/字、重畫熱力圖顏色（它有些顏色是用 JS 算的）。
   同 origin（front 也在 :8899）用 storage 事件即時聯動。
   跨 origin（end 在 :3000）靠連結攜帶 ?theme= 帶過去。 */
const curTheme = () =>
  document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  buildHeat();  // 熱力圖的柱子顏色是 JS 算的，換主題要重畫
  syncLinks();
}

/** end（學習城市）的網址，帶上目前主題 —— end 在別的 origin，靠 URL 把主題帶過去 */
function endUrl() {
  return `/ppa/end/?theme=${curTheme()}&from=lesson`;
}
/** 跨 app 連結永遠反映目前主題（導覽列的「學習城市」、右側「我的學習」都指向 end）*/
function syncLinks() {
  const url = endUrl();
  ['#toCityLink', '#toCityNav'].forEach(sel => {
    const el = $(sel);
    if (el) el.href = url;
  });
}

function wireTheme() {
  applyTheme('light');   // 全站固定亮色（已移除切換鈕）
}

/* ═════════════════════════════ 1 · 重播熱力圖 ═════════════════════════════
   每根柱子 = 5 秒，高度 = 那 5 秒有多少人倒回去重看。
   基線很低（沒人會無聊亂倒帶），所以峰值一眼就看得出來 —— 這是暫停訊號做不到的。 */

const heatMax = () => Math.max(...D.heatmap.map(b => b.replayers));

function heatColor(rate) {
  if (rate < 0.06) return '#39404f';
  if (rate < 0.14) return '#5a6a86';
  if (rate < 0.26) return '#c78a3a';
  if (rate < 0.42) return '#ff8c3a';
  return '#ff4d4d';
}

function buildHeat() {
  const max = heatMax();
  $('#heat').innerHTML = D.heatmap.map((b, i) =>
    `<i data-b="${i}" class="${b.sponsor ? 'skip' : ''}"
        style="--hh:${Math.max(2, (b.replayers / max) * 30).toFixed(1)}px;--hb:${heatColor(b.rate)}"></i>`
  ).join('');
}

/** 使用者倒回去重看 → 這一格立刻 +1，柱子長高、閃一下。
    整個原型的核心主張：訊號是「用」出來的，不是「猜」出來的。 */
function recordReplay(t) {
  const i = Math.floor(t / D.cohort.bucketSec);
  const b = D.heatmap[i];
  if (!b) return;

  b.replayers += 1;
  b.rate = b.replayers / D.cohort.n;
  state.myReplays.push(t);

  const bar = $(`#heat i[data-b="${i}"]`);
  if (bar) {
    bar.style.setProperty('--hh', `${Math.max(2, (b.replayers / heatMax()) * 30).toFixed(1)}px`);
    bar.style.setProperty('--hb', heatColor(b.rate));
    bar.classList.remove('bump');
    void bar.offsetWidth;
    bar.classList.add('bump');
  }

  const hot = D.hotspots.find(h => Math.abs(h.t - t) < 9);
  if (hot) {
    toast(`你是第 <b>${b.replayers}</b> 位倒回來重看 ${fmt(t)} 的人 — AI 助教認得這個點`,
          { em: '↺', ai: true, ms: 4200 });
  } else {
    toast(`已記錄重播 <b>${fmt(t)}</b> · 這一格累積 ${b.replayers} 人`, { em: '↺', ms: 2400 });
  }
}

/* 介入點標記（進度條上會脈動的紫點）
   燈泡畫在「卡片真正彈出來的那一秒」（峰值 +7），不是畫在峰值上 ——
   不然你會看到燈泡經過了、卻要再等 7 秒卡片才出現，那讀起來像壞掉。
   柱子是資料（大家倒帶的地方），燈泡是行為（AI 出現的地方），本來就差 7 秒。 */
function buildMarks() {
  $('#marks').innerHTML = D.hotspots.filter(h => h.intervene).map(h => `
    <button class="mark" data-h="${h.id}"
            style="left:${(triggerAt(h) / D.course.duration) * 100}%"
            title="${fmt(triggerAt(h))} AI 助教出現｜峰值 ${fmt(h.t)} · ${h.replayers} 人重播（${Math.round(h.rate * 100)}%）">💡</button>
  `).join('');

  $$('#marks .mark').forEach(m => m.onclick = e => {
    e.stopPropagation();
    const h = D.hotspots.find(x => x.id === m.dataset.h);
    $('#video').currentTime = h.t - 3;
    openCoach(h);
    expandCoach();          // 你是主動點進來的 —— 不用再叫你點一次「顯示更多」
  });
}

/* ═════════════════════════════ 目錄 ═════════════════════════════ */
function buildToc() {
  $('#toc').innerHTML = D.chapters.map((c, i) => {
    const next = D.chapters[i + 1]?.t ?? D.course.duration;
    const n = D.hotspots.filter(h => h.intervene && h.t >= c.t && h.t < next).length;
    return `<li data-i="${i}"><button data-t="${c.t}">
      <span class="ts">${fmt(c.t)}</span>
      <span class="bul"></span>
      <span class="tx">${c.title}${n ? `<i class="hotn">💡 ${n}</i>` : ''}</span>
    </button></li>`;
  }).join('');

  $$('#toc button').forEach(b => b.onclick = () => {
    $('#video').currentTime = +b.dataset.t;
    $('#video').play();
  });

  $('#resumeCard').onclick = () => {
    $('#video').currentTime = D.me.lastPosition;
    $('#video').play();
    toast(`從 <b>${fmt(D.me.lastPosition)}</b> 接著看`, { em: '▶' });
  };
}

/* ═════════════════════════════ 播放器 ═════════════════════════════ */

/** 播放狀態 → UI。單一入口，play / pause 事件都走這裡，圖示不會卡在錯的那一個。 */
function syncPlayIcon(playing) {
  $('#playBtn').classList.toggle('is-playing', playing);
  $('#player').classList.toggle('playing', playing);   // 中央大播放鍵靠這個 class 隱藏
}

function wirePlayer(v) {
  const player = $('#player');
  const track  = $('#track');

  const cueAt  = t => D.cues.find(c => t >= c.start && t < c.end);
  const chapAt = t => [...D.chapters].reverse().find(c => c.t <= t) ?? D.chapters[0];

  let ccOn = true;
  let lastPlayT = 0;      // 使用者 seek 之前，播到哪
  let jumping = false;    // 程式主動 seek（點目錄、點筆記時間戳）→ 不算重播

  const toggle = () => v.paused ? v.play() : v.pause();
  $('#playBtn').onclick = toggle;
  $('#bigPlay').onclick = toggle;
  v.onclick = toggle;

  v.onplay  = () => syncPlayIcon(true);
  v.onpause = () => syncPlayIcon(false);

  /* 緩衝轉圈：卡住時顯示，能播就收 */
  const vspin = $('#vspin');
  if (vspin) {
    const vshow = () => { vspin.hidden = false; };
    const vhide = () => { vspin.hidden = true; };
    v.addEventListener('waiting', vshow);
    v.addEventListener('seeking', vshow);
    v.addEventListener('stalled', vshow);
    v.addEventListener('playing', vhide);
    v.addEventListener('canplay', vhide);
    v.addEventListener('seeked',  vhide);
  }

  /* ── 重播偵測 ──
     往回拉 3–120 秒 = 「我沒聽懂，倒回去再聽一次」。
     點目錄 / 點筆記時間戳跳過去的，不算 —— 那是導覽，不是理解困難。 */
  v.onseeked = () => {
    const delta = v.currentTime - lastPlayT;
    resetHotspotsAfter(v.currentTime);

    if (!jumping && delta < -2.5 && delta > -120) {
      recordReplay(v.currentTime);
      // 你自己倒帶到熱點 = 你真的卡住了，不是路過。
      // 這種時候不用先給 mini 再叫你點「顯示更多」—— 直接攤開。
      const h = D.hotspots.find(x => x.intervene && Math.abs(x.t - v.currentTime) < 9);
      if (h) {
        state.shown.add(h.id);       // 已經開了，別讓 timeupdate 再開一次
        setTimeout(() => { openCoach(h); expandCoach(); }, 500);
      }
    }
    jumping = false;
    lastPlayT = v.currentTime;
  };

  /** 程式主動跳轉：不要被誤記成重播 */
  window.seekTo = (t, play = true) => {
    jumping = true;
    v.currentTime = t;
    if (play) v.play();
  };

  /* ↺ 10 秒 —— demo 時最好按的那顆，也是真實產品裡最常被按的那顆 */
  $('#replayBtn').onclick = () => {
    v.currentTime = Math.max(0, v.currentTime - 10);   // 走一般 seek 流程，會被記成重播
  };

  let lastCue = null;

  v.ontimeupdate = () => {
    const t = v.currentTime, d = D.course.duration;
    if (!v.seeking) lastPlayT = t;

    $('#trackFill').style.width = `${(t / d) * 100}%`;
    $('#trackKnob').style.left  = `${(t / d) * 100}%`;
    $('#tCur').textContent = fmt(t);

    // 字幕只在換句時重畫 —— 每秒 4 次重設 innerHTML 會把名詞小窗的 hover 打斷
    const cue = ccOn ? cueAt(t) : null;
    if (cue !== lastCue) {
      lastCue = cue;
      $('#subtitle').innerHTML = cue ? markGloss(cue.text) : '';
      if (!cue) closeGloss();
    }

    const ch = chapAt(t);
    $('#ctlChapter').textContent = ch.title;
    const i = D.chapters.indexOf(ch);
    $$('#toc li').forEach(li => li.classList.toggle('on', +li.dataset.i === i));

    // 每次「經過」都彈，不是只有第一次。（清除 state.shown 是 onseeked 的事：
    // 正常播放時 t 單調遞增，一個熱點只經過一次；會再經過，一定是因為你 seek 了。）
    tickHotspots(t);
  };

  /* 進度條：點擊 seek + hover 預覽（顯示那一秒有多少人重播） */
  const posOf = e => clamp((e.clientX - track.getBoundingClientRect().left) / track.offsetWidth, 0, 1);
  track.onclick = e => { v.currentTime = posOf(e) * D.course.duration; };

  track.onmousemove = e => {
    const t = posOf(e) * D.course.duration;
    const b = D.heatmap[Math.floor(t / D.cohort.bucketSec)];
    // 從峰值一路到燈泡（+7 秒）都算「這個熱點的地盤」——
    // 只比對峰值的話，滑到燈泡正上方反而不會有提示。
    const h = D.hotspots.find(x => x.intervene && t >= x.t - 5 && t <= triggerAt(x) + 3);
    const tip = $('#scrubTip');
    tip.hidden = false;
    tip.style.left = `${(t / D.course.duration) * 100}%`;
    tip.innerHTML = `${fmt(t)} · <b>${b?.replayers ?? 0}</b> 人倒回來重看`
      + (h ? `<span class="st-hot">💡 AI 助教介入點 — ${h.kindLabel}</span>` : '');
  };
  track.onmouseleave = () => $('#scrubTip').hidden = true;

  let hideT;
  player.onmousemove = () => {
    player.classList.add('hot');
    clearTimeout(hideT);
    hideT = setTimeout(() => !v.paused && player.classList.remove('hot'), 2600);
  };
  player.onmouseleave = () => !v.paused && player.classList.remove('hot');

  $('#muteBtn').onclick = () => {
    v.muted = !v.muted;
    $('#muteBtn').style.opacity = v.muted ? .4 : .92;
  };
  $('#ccBtn').onclick = () => {
    ccOn = !ccOn;
    $('#ccBtn').classList.toggle('off', !ccOn);
    if (!ccOn) $('#subtitle').textContent = '';
  };
  $('#fsBtn').onclick = () =>
    document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen();
  $('#clapBtn').onclick = e => {
    e.currentTarget.classList.add('clapped');
    $('#clapN').textContent = '100+';
  };

  document.onkeydown = e => {
    if (e.target.tagName === 'INPUT' || !$('#reels').hidden) return;
    if (e.code === 'Space')      { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight') { jumping = true; v.currentTime += 5; }
    if (e.code === 'ArrowLeft')  v.currentTime -= 5;   // 往回 = 重播（但 5 秒 < 門檻，不記）
  };
}

/* ═════════════════════════════ 2 · AI 助教介入 + 3 · 即時投票 ═════════════════════
   解說一出現就攤開 —— 你已經倒帶兩次了，我不該再讓你多點一下。

   下面接一題投票。投票不是考你，是為了讓你看見：
     · 63% 的同學第一次也答錯  → 挫折感消失
     · 你和 165 位同學選了一樣  → 孤獨的學習變成有人陪
     · 最多人選的那個是錯的     → 這是全班的共同誤解（也是後台最值錢的一格） */

let coachHot = null;
let coachFuse = null;         // 10 秒引信
const COACH_FUSE_MS = 10_000;

/* ── 熱點觸發的兩條規則 ──
   抽出來當模組層級的函式，不是為了好看 —— 是為了 selftest 叫得到。
   埋在 event handler 閉包裡的狀態機，等於沒辦法測。 */

/** 卡片不在峰值那一秒彈，往後延 7 秒。
    峰值那一刻你正在聽最關鍵的那句話 —— 這時候糊你一張卡，是在製造下一次倒帶。
    等你聽完，再問「要不要幫你？」 */
const COACH_DELAY = 7;
const triggerAt = h => h.t + COACH_DELAY;

/** 播到觸發點就彈。state.shown 只擋「同一次經過內的重複觸發」。 */
function tickHotspots(t) {
  for (const h of D.hotspots) {
    if (!h.intervene) continue;
    if (Math.abs(t - triggerAt(h)) < 0.6 && !state.shown.has(h.id)) {
      openCoach(h);   // openCoach 自己會記進 state.shown
    }
  }
}

/** seek 之後，所有「還在前面、還沒播到」的熱點全部重置 —— 播過去會再彈一次。

    不能用「離開 N 秒才重置」：↺10 只倒 10 秒，門檻只要大於 10，
    state.shown 就永遠清不掉，於是再播過去再也不彈。
    該問的不是「離開多遠」，是「它還在不在我前面」。

    唯一的例外是「現在正開著的那張卡」。點 💡 標記會 seek 到峰值前，
    seek 又會觸發重置 —— 不擋的話，你剛看完關掉，7 秒後同一張卡又彈出來。 */
function resetHotspotsAfter(t) {
  const openId = $('#coach').hidden ? null : coachHot?.id;
  for (const h of D.hotspots) {
    if (h.id === openId) continue;
    if (triggerAt(h) > t + 0.5) state.shown.delete(h.id);
  }
}

/** 先來一張 mini —— 你正在看影片，我不該一上來就糊你一整面。
    10 秒沒理它就自己走，展開了就不走。 */
function openCoach(h) {
  coachHot = h;
  state.shown.add(h.id);        // 開了就記著 —— 不管是自動彈的，還是你點 💡 開的
  const c = $('#coach');

  $('#coachPct').textContent   = `${Math.round(h.rate * 100)}%`;
  $('#coachRing').style.setProperty('--p', `${Math.round(h.rate * 100)}%`);
  $('#coachCount').textContent = `${h.replayers} 位同學`;
  $('#coachSub').innerHTML     = `把這段倒回去重看，平均 <b>${h.avgReplays}</b> 次`;

  c.classList.remove('full');
  c.classList.add('mini');
  c.hidden = false;
  c.scrollTop = 0;
  $('#player').classList.add('coached', 'mini-coach');   // mini 比較窄，字幕少讓一點

  armFuse();
}

/** 10 秒引信。按鈕上那條會走完的細線就是它 —— 讓人知道它會自己消失，不用急著關。 */
function armFuse() {
  clearTimeout(coachFuse);
  const fuse = $('#coachFuse');
  fuse.style.animation = 'none';
  void fuse.offsetWidth;
  fuse.style.animation = `fuse ${COACH_FUSE_MS}ms linear forwards`;
  coachFuse = setTimeout(closeCoach, COACH_FUSE_MS);
}

function disarmFuse() {
  clearTimeout(coachFuse);
  coachFuse = null;
  $('#coachFuse').style.animation = 'none';
}

/** 按了「顯示更多」才長成完整卡：解說直接攤開 + 一題投票。引信同時拆掉。 */
function expandCoach() {
  const h = coachHot;
  disarmFuse();
  $('#video').pause();   // 你要開始讀東西了 —— 影片不該在背後繼續跑

  // 助教卡裡的專有名詞照樣點得開 —— 它講的東西不會比字幕好懂到哪去。
  // markGloss 要在 md 之前跑：markGloss 會 escape HTML，先跑 md 的話 <strong> 會被吃掉。
  // 選項不標名詞 —— 那是個按鈕，點下去會投票，跟「我只是想查個詞」打架。
  $('#coachAnswer').innerHTML = h.answer.map(a => `<p>${md(markGloss(a))}</p>`).join('');
  $('#coachSticky').innerHTML = markGloss(h.sticky);

  const done = state.polled[h.id] !== undefined;
  $('#pollQ').innerHTML = markGloss(h.poll.q);
  $('#pollOpts').innerHTML = h.poll.options.map((o, i) =>
    `<button class="popt" data-i="${i}"><span class="k">${'ABC'[i]}</span><span>${o.t}</span></button>`
  ).join('');
  $$('#pollOpts .popt').forEach(b => b.onclick = () => answerPoll(h, +b.dataset.i));

  $('#poll').hidden    = done;
  $('#pollRes').hidden = !done;
  if (done) renderPollResult(h, state.polled[h.id]);

  const c = $('#coach');
  c.classList.remove('mini');
  c.classList.add('full');
  $('#player').classList.remove('mini-coach');
}

function closeCoach() {
  disarmFuse();
  $('#coach').hidden = true;
  $('#player').classList.remove('coached', 'mini-coach');
}

function answerPoll(h, pick) {
  state.polled[h.id] = pick;
  $('#video').pause();
  $('#poll').hidden = true;
  $('#pollRes').hidden = false;
  renderPollResult(h, pick);
}

function renderPollResult(h, pick) {
  const opts = h.poll.options;
  const right = opts.findIndex(o => o.ok);
  const ok    = pick === right;

  // 最多人選的那個。如果它是錯的 → 全班的共同誤解。
  const top = opts.reduce((a, b) => (b.pct > a.pct ? b : a));
  const topWrong = !top.ok;

  const peers = Math.round(opts[pick].pct * h.replayers);
  const wrongPct = Math.round(h.wrongRate * 100);

  $('#pollRes').innerHTML = `
    <div class="pr-bars">
      ${opts.map((o, i) => `
        <div class="pr-row ${o.ok ? 'ok' : ''} ${i === pick ? 'mine' : ''}">
          <span class="pr-k">${'ABC'[i]}</span>
          <div class="pr-bar"><i style="--w:${o.pct * 100}%"></i></div>
          <span class="pr-t">${o.t}</span>
          <span class="pr-p">${Math.round(o.pct * 100)}%</span>
          ${o.ok ? '<span class="pr-tick">✓</span>' : ''}
          ${i === pick ? '<span class="pr-you">你</span>' : ''}
        </div>`).join('')}
    </div>

    <div class="pr-say ${ok ? 'good' : 'warm'}">
      ${ok
        ? `<b>答對了 —— 而且只有 ${Math.round(h.correctRate * 100)}% 的人選對。</b>
           你和 <b>${peers}</b> 位同學站在同一邊。`
        : `<b>${wrongPct}% 的同學第一次也答錯了。</b>
           你和 <b>${peers}</b> 位同學選了一樣的答案 —— 這題本來就難，不是你的問題。`}
    </div>

    ${topWrong ? `
      <div class="pr-blind">
        <b>全班最大的誤解</b>
        ${h.poll.blind}
      </div>` : ''}
  `;
}

function wireCoach(v) {
  $('#coachX').onclick    = closeCoach;
  $('#coachMore').onclick = expandCoach;

  // 滑鼠移到卡片上 = 你在看它 → 引信暫停，不要在你讀到一半時消失
  const c = $('#coach');
  c.onmouseenter = () => { if (c.classList.contains('mini')) disarmFuse(); };
  c.onmouseleave = () => { if (c.classList.contains('mini') && !coachFuse) armFuse(); };

  $('#coachClip').onclick = () => {
    const i = D.clips.findIndex(x => x.hotspot === coachHot.id);
    closeCoach();
    openReels(i < 0 ? 0 : i);
  };

  $('#coachAsk').onclick = () => {
    closeCoach();
    openTutor(coachHot.poll.q.replace(/？$/, ''));
  };
}

/* ═════════════════════════ 字幕裡的專有名詞 ═════════════════════════
   點一下就地展開名詞卡，不跳去筆記面板。
   你只是想知道「牙齦溝是什麼」—— 不該為了這件事離開影片。 */

// 長的排前面：避免「牙周病」被「牙周」之類的短詞先吃掉
const GLOSS_RE = () => new RegExp(
  '(' + D.notes.glossary.map(g => g.term)
          .sort((a, b) => b.length - a.length)
          .join('|') + ')', 'g');

let glossRe = null;
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function markGloss(text) {
  glossRe ??= GLOSS_RE();
  return esc(text).replace(glossRe, m => `<em class="gl" data-term="${m}">${m}</em>`);
}

function wireGloss(v) {
  // 委派綁在整個 player 上 —— 字幕和助教卡都會一直重畫，個別綁會掉。
  $('#player').addEventListener('click', e => {
    const el = e.target.closest('.gl');
    if (el) { e.stopPropagation(); openGloss(el, v); }
  });

  $('#gpX').onclick = closeGloss;
  $('#video').addEventListener('click', closeGloss);   // 點影片其他地方就收起來
  $('#coach').addEventListener('scroll', closeGloss);  // 卡片一捲，小窗的定位就失準了
}

function openGloss(el, v) {
  const g = D.notes.glossary.find(x => x.term === el.dataset.term);
  if (!g) return;

  v.pause();   // 你要讀東西了 —— 影片不該繼續跑

  const pop    = $('#gpop');
  const player = $('#player');

  $('#gpTerm').textContent  = g.term;
  $('#gpDef').textContent   = g.def;
  $('#gpFirst').textContent = `首次出現 ${fmt(g.t)}`;
  $('#gpJump').onclick = () => {
    closeGloss();
    v.currentTime = g.t - 1.5;   // 走一般 seek → 往回拉的話會被記成一次重播，本來就是
    v.play();
  };

  pop.hidden = false;
  pop.classList.remove('below');

  const r  = el.getBoundingClientRect();
  const pr = player.getBoundingClientRect();
  const w  = pop.offsetWidth;
  const hh = pop.offsetHeight;

  // 水平：對齊那個詞的中心，但夾在播放器邊界內
  pop.style.left = `${clamp(r.left - pr.left + r.width / 2, w / 2 + 12, pr.width - w / 2 - 12)}px`;

  // 垂直：預設浮在詞的上方。上面塞不下就翻到下面 ——
  // 助教卡裡的名詞位置很高，不翻的話小窗會被切掉半截。
  if (r.top - pr.top < hh + 20) {
    pop.classList.add('below');
    pop.style.top    = `${r.bottom - pr.top + 14}px`;
    pop.style.bottom = 'auto';
  } else {
    pop.style.bottom = `${pr.bottom - r.top + 14}px`;
    pop.style.top    = 'auto';
  }

  $$('.gl.on').forEach(x => x.classList.remove('on'));
  el.classList.add('on');
}

function closeGloss() {
  $('#gpop').hidden = true;
  $$('.gl.on').forEach(x => x.classList.remove('on'));
}

/* ═════════════════════════════ 4 · AI 助教整理筆記 ═════════════════════════════ */
function wireNotes(v) {
  $('#notesBtn').onclick = () => {
    const n = $('#notes');
    if (!n.hidden) { n.hidden = true; return; }
    n.hidden = false;
    n.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    generateNotes(v);
  };
  $('#notesX').onclick = () => $('#notes').hidden = true;
}

async function generateNotes(v) {
  const body = $('#notesBody');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const mine = myReplays();

  const steps = [
    `讀取逐字稿 ${D.cues.length} 條字幕（9 分 25 秒）`,
    `比對全班 ${D.cohort.n} 人的重播熱力圖`,
    `找出 ${D.hotspots.filter(h => h.intervene).length} 個卡關點，其中 ${mine.length} 個你自己也倒帶了`,
    `萃取 ${D.notes.keyPoints.length} 個重點、${D.notes.glossary.length} 張名詞卡、${D.notes.numbers.length} 個關鍵數字`,
    `從全班的投票分布，生成 1 題知識挑戰`,
  ];

  $('#notesH').textContent = '正在讀你的 9 分 25 秒逐字稿…';
  body.innerHTML = `<div class="gen">${steps.map(s =>
    `<div class="gen-step"><span class="tick">○</span>${s}</div>`).join('')}
    <div class="gen-line" style="width:88%"></div>
    <div class="gen-line" style="width:64%"></div></div>`;

  for (const [i, row] of $$('.gen-step', body).entries()) {
    row.classList.add('run');
    await wait(300 + i * 85);
    $('.tick', row).textContent = '✓';
    row.classList.remove('run');
  }
  await wait(240);

  $('#notesH').textContent = '這一堂，AI 幫你留下這些';
  renderNotes(body, v);
  toast(`筆記整理完成 · 含你倒帶過的 <b>${mine.length}</b> 個地方`, { ai: true });
}

/** 我倒帶過、而且全班也倒帶的地方 */
function myReplays() {
  const mine = state.myReplays.length ? state.myReplays : D.me.myReplays;
  return D.hotspots
    .filter(h => h.intervene)
    .map(h => ({ h, n: mine.filter(p => Math.abs(p - h.t) < 10).length }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n);
}

function renderNotes(body, v) {
  const mine = myReplays();
  const jump = t => `data-jump="${t}"`;

  body.innerHTML = `
    <div class="nsec">
      <div class="nsec-h">一句話總結</div>
      <div class="n-summary">${D.notes.summary}</div>
    </div>

    ${mine.length ? `
    <div class="nsec">
      <div class="nsec-h">你倒帶過的地方 · ${mine.length} 處</div>
      <div class="n-stuck">
        ${mine.map(({ h, n }) => `
          <div class="n-stuck-row">
            <span class="ts">${fmt(h.t)}</span>
            <span class="tx">${h.label}
              <em>你重看了 ${n} 次 · 全班有 ${h.replayers} 人（${Math.round(h.rate * 100)}%）也倒帶了</em>
            </span>
            <button class="btn btn-ai" ${jump(h.t)}>重看 ↺</button>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="nsec">
      <div class="nsec-h">重點 · ${D.notes.keyPoints.length} 條（點時間戳跳回影片）</div>
      <div class="n-points">
        ${D.notes.keyPoints.map(p => `
          <button class="n-point" ${jump(p.t)}>
            <span class="ts">${fmt(p.t)}</span><span class="tx">${p.point}</span>
          </button>`).join('')}
      </div>
    </div>

    <div class="nsec">
      <div class="nsec-h">關鍵數字</div>
      <div class="n-nums">
        ${D.notes.numbers.map(n => `
          <button class="n-num" ${jump(n.t)}><b>${n.v}</b><span>${n.k}</span></button>`).join('')}
      </div>
    </div>

    <div class="nsec">
      <div class="nsec-h">名詞卡 · ${D.notes.glossary.length} 張</div>
      <div class="n-grid">
        ${D.notes.glossary.map(g => `
          <button class="n-term" ${jump(g.t)}><b>${g.term}</b><span>${g.def}</span></button>`).join('')}
      </div>
    </div>

    <div class="nsec">
      <div class="nsec-h">知識挑戰 · 答對就完成今天的打卡</div>
      <div class="quiz" id="quiz"></div>
    </div>
  `;

  $$('[data-jump]', body).forEach(el => el.onclick = e => {
    e.stopPropagation();
    window.seekTo(+el.dataset.jump - 2);
    $('#player').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  renderQuiz($('#quiz'));
}

/** 知識挑戰用全課最高峰那題 —— 並且照樣公開全班分布。 */
function renderQuiz(box) {
  const h = D.hotspots.filter(h => h.intervene).sort((a, b) => b.rate - a.rate)[0];
  const q = h.poll;
  const right = q.options.findIndex(o => o.ok);

  box.innerHTML = `
    <div class="quiz-q"><span class="ts">${fmt(h.t)}</span>${q.q}</div>
    <div class="quiz-opts">
      ${q.options.map((o, i) => `
        <button class="qopt" data-i="${i}">
          <span class="k">${'ABC'[i]}</span><span>${o.t}</span>
        </button>`).join('')}
    </div>`;

  $$('.qopt', box).forEach(btn => btn.onclick = () => {
    const pick = +btn.dataset.i;
    const ok = pick === right;

    $$('.qopt', box).forEach(b => {
      const i = +b.dataset.i;
      b.disabled = true;
      b.insertAdjacentHTML('beforeend',
        `<span class="qpct">${Math.round(q.options[i].pct * 100)}% 的人選這個</span>`);
      if (i === right) b.classList.add('right');
    });
    if (!ok) btn.classList.add('wrong');

    box.insertAdjacentHTML('beforeend', `
      <div class="quiz-ex">
        <b>${ok ? '答對了。' : `${Math.round(h.wrongRate * 100)}% 的同學第一次也答錯 —— 你不孤單。`}</b>
        ${h.sticky}
      </div>
      <div class="quiz-done">
        <span class="flame">🔥</span>
        <div>連續打卡 <b>第 4 天</b> — 這是留存最強的預測因子（r=+0.356）。<br>
        AI 助教已依你倒帶的地方排好 <b>3 次回訪推播</b>，點右上角 🔔 看排程。</div>
      </div>
      <!-- 動線下一站：學完 → 去學習城市看它長大 -->
      <a class="city-cta" href="${endUrl()}">
        <span class="city-cta-ic">🏙️</span>
        <span class="city-cta-tx">
          <b>這次學習已記進你的學習城市</b>
          <em>去看它長大 —— +9 分鐘學習、離升級更近一步</em>
        </span>
        <span class="city-cta-go">前往學習城市 →</span>
      </a>`);

    $('#bellDot').hidden = false;
    toast('AI 已排好 3 次回訪推播 · 點右上角 🔔', { em: '🔔', ai: true, ms: 5200 });
  });
}

/* ═════════════════════════════ 5 · 精華 Reels ═════════════════════════════ */
function wireReels(v) {
  $('#reelsBtn').onclick = () => openReels(0);
  $('#reelsX').onclick   = closeReels;

  document.addEventListener('keydown', e => {
    if ($('#reels').hidden) return;
    if (e.code === 'Escape')    closeReels();
    if (e.code === 'ArrowDown') { e.preventDefault(); goReel(state.reelIdx + 1); }
    if (e.code === 'ArrowUp')   { e.preventDefault(); goReel(state.reelIdx - 1); }
  });
}

function openReels(idx = 0) {
  $('#video').pause();
  const feed = $('#reelsFeed');

  feed.innerHTML = D.clips.map((c, i) => `
    <section class="reel" data-i="${i}">
      <div class="reel-card" style="--bgimg:url('assets/thumbs/${c.id}.jpg')">
        <div class="reel-prog"><i></i></div>
        <div class="reel-tag">
          <span class="rtag ai">✦ AI 剪輯</span>
          ${c.replayers ? `<span class="rtag hot">↺ ${c.replayers} 人倒帶</span>` : ''}
          <span class="rtag">${Math.round(c.dur)} 秒</span>
          <span class="rtag">${c.chapter}</span>
        </div>

        <div class="reel-why">
          ${c.replayers
            ? `↺ <b>${c.replayers}</b> 人把這段倒回去重看${c.id === 'c5' ? ' — 全課最高' : ''}`
            : '💡 課程收尾的核心觀點'}
        </div>

        <div class="reel-media">
          <video playsinline preload="none" poster="assets/thumbs/${c.id}.jpg"></video>
          <div class="vspin" hidden></div>
        </div>

        <div class="reel-cap"></div>

        <div class="reel-foot">
          <span class="reel-hook">${c.hook}</span>
          <div class="reel-title">${c.title}</div>
          <div class="reel-take">${c.takeaway}</div>
          <button class="reel-cta" data-t="${c.start}">
            <span>回到完整課程 ${fmt(c.start)}</span><b>看完整段 →</b>
          </button>
        </div>

        <div class="reel-rail">
          <button class="rrail like" data-i="${i}"><span class="ic">♥</span><b>${1200 + i * 137}</b></button>
          <button class="rrail save" data-i="${i}"><span class="ic">★</span><b>存</b></button>
          <button class="rrail ask"  data-i="${i}"><span class="ic">✎</span><b>出題</b></button>
        </div>
      </div>
    </section>`).join('');

  $('#reels').hidden = false;
  document.body.style.overflow = 'hidden';

  $$('.reel-cta', feed).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const t = +b.dataset.t;
    closeReels();
    window.seekTo(t);
    $('#player').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(`從精華跳回完整課程 <b>${fmt(t)}</b>`, { em: '▶' });
  });
  $$('.rrail.like', feed).forEach(b => b.onclick = e => {
    e.stopPropagation();
    b.classList.toggle('on');
  });
  $$('.rrail.save', feed).forEach(b => b.onclick = e => {
    e.stopPropagation();
    b.classList.add('on');
    toast('已存到「我的精華」· 明天推播會再提醒你', { em: '★', ai: true });
  });
  $$('.rrail.ask', feed).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const c = D.clips[+b.dataset.i];
    toast(`AI 依「${c.hook}」出了 1 題 · 收進今天的知識挑戰`, { em: '✎', ai: true, ms: 4000 });
  });
  $$('.reel-media', feed).forEach(m => m.onclick = () => {
    const vid = $('video', m);
    vid.paused ? vid.play() : vid.pause();
  });

  let tick;
  feed.onscroll = () => {
    clearTimeout(tick);
    tick = setTimeout(() => {
      const i = Math.round(feed.scrollTop / window.innerHeight);
      if (i !== state.reelIdx) activateReel(i);
    }, 80);
  };

  goReel(idx, false);
}

function goReel(i, smooth = true) {
  i = clamp(i, 0, D.clips.length - 1);
  $('#reelsFeed').scrollTo({ top: i * window.innerHeight, behavior: smooth ? 'smooth' : 'auto' });
  activateReel(i);
}

/** active ±1 掛 src 並預先緩衝（preload=auto），切換時更順；其餘卸載省記憶體。 */
function activateReel(i) {
  state.reelIdx = i;
  $('#reelsIdx').textContent = `${i + 1} / ${D.clips.length}`;

  $$('.reel').forEach(sec => {
    const j    = +sec.dataset.i;
    const vid  = $('video', sec);
    const c    = D.clips[j];
    const spin = $('.vspin', sec);

    if (Math.abs(j - i) <= 1) {
      // active 與左右鄰居：掛 src 並允許預先緩衝，切過去就不用重等
      if (!vid.src) { vid.preload = 'auto'; vid.src = D.course.src; vid.currentTime = c.start; }
    } else {
      vid.pause();
      vid.removeAttribute('src');
      vid.load();
      if (spin) spin.hidden = true;
      return;
    }

    if (j === i) {
      $('.reel-cap', sec).textContent = c.lines[0]?.text ?? '';

      // 緩衝轉圈：卡住時顯示，能播就收（只綁一次）
      if (spin && !vid._spinWired) {
        vid._spinWired = true;
        const show = () => { if (+sec.dataset.i === state.reelIdx) spin.hidden = false; };
        const hide = () => { spin.hidden = true; };
        vid.addEventListener('waiting', show);
        vid.addEventListener('seeking', show);
        vid.addEventListener('stalled', show);
        vid.addEventListener('playing', hide);
        vid.addEventListener('canplay', hide);
        vid.addEventListener('seeked',  hide);
      }
      if (spin) spin.hidden = vid.readyState >= 3;

      const start = () => { vid.currentTime = c.start; vid.play().catch(() => {}); };
      vid.readyState >= 1 ? start() : vid.addEventListener('loadedmetadata', start, { once: true });

      vid.ontimeupdate = () => {
        const t = vid.currentTime;
        if (t >= c.end || t < c.start - 0.5) { vid.currentTime = c.start; return; }
        $('i', $('.reel-prog', sec)).style.width = `${((t - c.start) / (c.end - c.start)) * 100}%`;
        $('.reel-cap', sec).textContent = c.lines.find(l => t >= l.start && t < l.end)?.text ?? '';
      };
    } else {
      vid.pause();
      vid.ontimeupdate = null;
      if (spin) spin.hidden = true;
    }
  });
}

function closeReels() {
  $$('#reelsFeed video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
  $('#reels').hidden = true;
  $('#reelsFeed').innerHTML = '';
  document.body.style.overflow = '';
}

/* ═════════════════════════════ 6 · 主動推播 ═════════════════════════════
   排程有兩個輸入：你倒帶在哪，以及內容自己說了什麼。
   影片講「睡前那次最重要」→ 推播就排在睡前。那是行為真正會發生的時刻。 */
function wirePush(v) {
  $('#bellBtn').onclick   = openSched;
  $('#schedX').onclick    = () => $('#sched').hidden = true;
  $('#pushLater').onclick = () => {
    $('#push').hidden = true;
    toast('好 — 那我明天同一時間再提醒你一次', { em: '🔔', ms: 3000 });
  };
  $('#schedDemo').onclick = () => {
    $('#sched').hidden = true;
    setTimeout(() => showPush(D.push[0]), 340);
  };
}

function openSched() {
  $('#bellDot').hidden = true;
  const label = { rescue: '救援', spaced: '間隔重複', completion: '完課' };
  $('#schedList').innerHTML = D.push.map(p => {
    const clip = D.clips.find(c => c.id === p.clip);
    return `
      <li class="sched-item">
        <div class="sched-when">
          <b>${p.when}</b><i class="${p.kind}">${label[p.kind]}</i>
        </div>
        <div class="sched-main">
          <strong>${p.title}</strong>
          <p>${p.body}</p>
          <div class="sched-tag">
            <b>觸發：</b>${p.trigger}<br>
            <b>時機：</b>${p.whenNote}<br>
            <b>內容：</b>${Math.round(clip.dur)} 秒精華「${clip.hook}」
          </div>
        </div>
      </li>`;
  }).join('');
  $('#sched').hidden = false;
}

function showPush(p) {
  const clip = D.clips.find(c => c.id === p.clip);
  $('#pushWhen').textContent  = p.when;
  $('#pushTitle').textContent = p.title;
  $('#pushBody').textContent  = p.body;
  $('#pushWhy').textContent   = `${p.trigger}。${p.whenNote}。`;
  $('#pushOpen').textContent  = `看 ${Math.round(clip.dur)} 秒精華 →`;
  $('#push').hidden = false;

  $('#pushOpen').onclick = () => {
    $('#push').hidden = true;
    openReels(D.clips.findIndex(c => c.id === p.clip));
    toast('從推播直接進精華 — 這就是回訪的入口', { em: '📲', ai: true, ms: 4000 });
  };
}

/* ═════════════════════════════ AI 助教側欄（PPA 現行外殼）═════════════════════════
   只做外殼。回覆是從課程的名詞卡 / 重點做本地檢索拼出來的，沒有接 LLM。 */
function wireTutor(v) {
  $('#aiTab').onclick  = () => openTutor();
  $('#tutorX').onclick = () => $('#tutor').hidden = true;
  $('#tutorSend').onclick = () => {
    const q = $('#tutorInput').value.trim();
    if (q) { askTutor(q); $('#tutorInput').value = ''; }
  };
  $('#tutorInput').onkeydown = e => {
    if (e.key === 'Enter') $('#tutorSend').click();
  };
}

function openTutor(q) {
  const t = $('#tutor');
  if (t.hidden) {
    t.hidden = false;
    if (!$('#tutorBody').children.length) askTutor('什麼是牙齦溝');
  }
  if (q) askTutor(q);
}

/** 本地檢索：從名詞卡 / 重點裡撈最相關的一條。這是外殼，不是 AI。 */
function tutorAnswer(q) {
  const g = D.notes.glossary.find(x => q.includes(x.term))
         ?? D.notes.glossary.find(x => x.def.includes(q.slice(0, 3)));
  if (g) {
    return {
      lead: `「**${g.term}**」${g.def}`,
      points: D.notes.keyPoints.filter(p => p.point.includes(g.term)).slice(0, 3),
      chips: D.notes.glossary.filter(x => x.term !== g.term).slice(0, 2).map(x => x.term),
      t: g.t,
    };
  }
  const h = D.hotspots.find(x => x.intervene && (q.includes(x.kindLabel) || x.poll.q.includes(q.slice(0, 3))));
  if (h) {
    return {
      lead: h.answer.join(' '),
      points: [], chips: ['牙齦溝', '貝氏刷牙法'], t: h.t,
    };
  }
  return {
    lead: '這一題我在這堂課的逐字稿裡找不到明確答案。'
        + '你可以換個關鍵字，或直接看課程目錄。（原型：本地檢索，未接 LLM）',
    points: [], chips: ['牙齦溝', '貝氏刷牙法', '牙菌斑'], t: null,
  };
}

function askTutor(q) {
  const body = $('#tutorBody');
  const a = tutorAnswer(q);

  body.insertAdjacentHTML('beforeend', `
    <div class="t-user">${q}</div>
    <div class="t-ai">
      <div class="t-sec">推薦學習章節</div>
      <button class="t-course" data-t="${a.t ?? 0}">
        <div class="t-thumb"><b>9:25</b></div>
        <div class="t-course-tx">
          <strong>${D.course.unit} ${D.course.title}</strong>
          <span>${D.course.instructor}</span>
        </div>
      </button>

      <div class="t-md">${md(a.lead)}</div>
      ${a.points.length ? `<ul class="t-list">${a.points.map(p =>
        `<li><b>${fmt(p.t)}</b> ${p.point}</li>`).join('')}</ul>` : ''}

      <div class="t-react"><button>📌</button><button>👍</button><button>👎</button></div>

      ${a.chips.length ? `
        <div class="t-more">或是想看</div>
        <div class="t-chips">${a.chips.map(c => `<button class="t-chip">${c}</button>`).join('')}</div>` : ''}
    </div>`);

  $$('.t-course', body).forEach(b => b.onclick = () => {
    window.seekTo(+b.dataset.t - 2);
    $('#tutor').hidden = true;
    $('#player').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $$('.t-chip', body).forEach(b => b.onclick = () => askTutor(b.textContent));

  body.scrollTop = body.scrollHeight;
}

/* ═════════════════════════════ Demo 捷徑 ═════════════════════════════
     ?open=coach   播到最高峰的卡關點，助教卡攤開（?h=h6 指定）
     ?open=notes   AI 筆記      ?open=reels  精華 Reels（?i=2）
     ?open=sched   推播排程      ?open=push   推播卡
     ?open=tutor   AI 助教側欄   ?t=297       跳到第幾秒                  */
function demoJump(v) {
  const q = new URLSearchParams(location.search);
  if (q.has('t')) v.currentTime = +q.get('t');

  switch (q.get('open')) {
    case 'coach': {
      const h = D.hotspots.find(x => x.id === (q.get('h') || 'h5'));
      v.currentTime = h.t;
      state.shown.add(h.id);
      openCoach(h);
      if (!q.has('mini')) expandCoach();   // ?open=coach&mini=1 → 停在 mini 狀態
      break;
    }
    case 'gloss': {
      // 跳到某個專有名詞第一次被講到的那句字幕，並就地打開名詞小窗
      const term = q.get('term') || '牙齦溝';
      const cue  = D.cues.find(c => c.text.includes(term));
      if (!cue) break;
      v.currentTime = cue.start + 0.2;
      $('#subtitle').innerHTML = markGloss(cue.text);
      setTimeout(() => {
        const el = $(`.subtitle .gl[data-term="${term}"]`);
        if (el) openGloss(el, v);
      }, 400);
      break;
    }
    case 'notes':
      $('#notesBtn').click();
      // ?open=notes&quiz=done → 自動答一題，帶出完課 + 去學習城市的 CTA（方便驗證/展示）
      if (q.get('quiz') === 'done') {
        setTimeout(() => $('#quiz .qopt')?.click(), 3600);   // 等筆記生成動畫跑完
      }
      break;
    case 'reels': openReels(+(q.get('i') || 0)); break;
    case 'sched': openSched(); break;
    case 'push':  showPush(D.push[0]); break;
    case 'tutor': openTutor(); break;
  }
  if (q.has('probe'))    setTimeout(probe, 900);
  if (q.has('selftest')) setTimeout(selftest, 900);
}

/* 自我測試：重現「關掉助教卡 → 倒帶 → 再播過去，卡片還會不會出現」。
   這種狀態機 bug 光讀程式碼很容易騙自己 —— 跑一遍才算數。

   直接驅動 tickHotspots / resetHotspotsAfter，不透過真的 <video>：
   headless Chrome 沒有 media pipeline，seek 永遠不會完成，測試會卡死。
   而這兩個函式本來就是狀態機的全部 —— 測它們就等於測到了。

   結果寫進 title，headless --dump-dom 讀得到。 */
function selftest() {
  const open = () => !$('#coach').hidden;
  const H    = D.hotspots.find(h => h.id === 'h1');   // 84s
  const out  = [];
  const ok   = (name, pass) => out.push(`${name}=${pass ? 'PASS' : 'FAIL'}`);

  const T = triggerAt(H);   // 峰值 + 7 秒 = 卡片真正該彈的時間
  state.shown.clear();
  closeCoach();

  // 1 峰值當下「不」該彈 —— 那時你正在聽最關鍵的那句話
  tickHotspots(H.t);
  ok('1.峰值當下不打擾', !open());

  // 2 峰值 +7 秒才彈
  tickHotspots(T);
  ok('2.峰值+7秒才彈', open());

  // 3 使用者關掉
  closeCoach();
  ok('3.關得掉', !open());

  // 4 按 ↺10 倒回 10 秒 —— 這正是原本會壞掉的距離（舊門檻 14 秒 > 倒帶 10 秒）
  resetHotspotsAfter(T - 10);
  tickHotspots(T - 10);
  ok('4.倒帶後維持關閉', !open());

  // 5 再播過去 —— 修好前這裡是 FAIL（state.shown 清不掉，永遠不再彈）
  tickHotspots(T);
  ok('5.再經過會再彈', open());

  // 6 展開後影片要暫停 + 卡內專有名詞可點
  const v = $('#video');
  expandCoach();
  ok('6.展開後影片暫停', v.paused);
  const n = $$('#coachAnswer .gl').length + $$('#coachSticky .gl').length + $$('#pollQ .gl').length;
  ok(`7.卡內名詞可點(${n})`, n > 0);

  // 8 往前跳過熱點，再倒回來 —— 一樣要能再彈
  closeCoach();
  state.shown.clear();
  tickHotspots(T);
  closeCoach();
  resetHotspotsAfter(T + 200);          // 往前跳（熱點在後面了 → 不該重置）
  ok('8.往前跳不誤觸重置', state.shown.has(H.id));
  resetHotspotsAfter(20);               // 倒回開頭 → 該重置
  tickHotspots(T);
  ok('9.倒回開頭後會再彈', open());

  // 10 點 💡 主動開卡 → 它會 seek，但正開著的那張不該被 seek 重置
  //    （不然你剛看完關掉，7 秒後同一張又彈出來）
  closeCoach();
  state.shown.clear();
  openCoach(H);                         // 模擬點 💡
  resetHotspotsAfter(H.t - 3);          // 模擬它跟著做的 seek
  ok('10.開著的卡不被seek清掉', state.shown.has(H.id));

  // 11/12 播放鍵圖示 —— 兩個事件都走 syncPlayIcon，不該卡在錯的那一個
  v.dispatchEvent(new Event('play'));
  ok('11.播放中顯示暫停鍵', $('#playBtn').classList.contains('is-playing'));
  v.dispatchEvent(new Event('pause'));
  ok('12.暫停時顯示播放鍵', !$('#playBtn').classList.contains('is-playing'));

  // 13 進度條上的燈泡要畫在「卡片真正彈出的那一秒」，不是畫在峰值上
  const drift = D.hotspots.filter(h => h.intervene).map(h => {
    const left = parseFloat($(`#marks .mark[data-h="${h.id}"]`).style.left);
    return Math.abs(left - (triggerAt(h) / D.course.duration) * 100);
  });
  ok('13.燈泡對齊觸發點', Math.max(...drift) < 0.05);

  closeCoach();
  state.shown.clear();
  document.title = 'SELFTEST ' + out.join(' · ');
}

/* 版面探針：用量的，不用眼睛猜。結果寫進 title，headless --dump-dom 讀得到。 */
function probe() {
  const R  = s => $(s)?.getBoundingClientRect();
  const px = n => Math.round(n);
  const track = R('#track'), heat = R('#heat'), sub = R('.subtitle'), ctl = R('.controls');
  const bars  = $$('#heat i');
  const first = bars[0].getBoundingClientRect(), last = bars.at(-1).getBoundingClientRect();

  document.title = 'PROBE ' + [
    `track=[${px(track.left)},${px(track.right)}]`,
    `align=${Math.abs(first.left - track.left) < 2 && Math.abs(last.right - track.right) < 2 ? 'OK' : 'OFF'}`,
    `bars#=${bars.length}`,
    `marks#=${$$('.mark').length}`,
    `sub=${sub ? `[${px(sub.top)},${px(sub.bottom)}]` : 'none'}`,
    `ctlTop=${px(ctl.top)}`,
    `subClear=${!sub || sub.bottom <= ctl.top + 2 ? 'OK' : 'OVERLAP'}`,
    `t=${$('#video').currentTime.toFixed(1)}`,
  ].join(' · ');
}

window.onerror = m => { document.title = 'JS-ERROR: ' + m; };
