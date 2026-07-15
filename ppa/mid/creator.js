/* ═══════════════════════════════════════════════════════════════════════
   創作者後台
   ─────────────────────────────────────────────────────────────────────
   學員端問的是「我卡在哪」。這裡問的是另一個問題：

       「我這堂課，哪裡沒講清楚？」

   兩個訊號回答它：
     重播熱力圖 → 他們在哪幾秒倒回去（= 哪裡難）
     投票分布   → 他們在那裡答錯了什麼（= 難在哪、錯成什麼樣）

   第二個才是關鍵。重播只說「這段有問題」；
   投票說的是「132 個人以為刷牙要垂直刷」—— 那是可以動手改的東西。
   ═══════════════════════════════════════════════════════════════════════ */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = s => {
  s = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

let D;

(async function init() {
  D = await (await fetch('data/course.json')).json();
  stats();
  misconceptions();
  heatmap();
  sponsor();
  diagnostics();
  assets();
})();

/* ═════════════════════════ 總覽 ═════════════════════════ */
function stats() {
  const hot   = D.hotspots.filter(h => h.intervene);
  const peak  = D.hotspots.reduce((a, b) => (b.replayers > a.replayers ? b : a));
  const total = D.hotspots.reduce((s, h) => s + h.totalReplays, 0);
  // 全班平均答對率 —— 低於 50% 的題目，代表那一段是真的沒講清楚
  const acc   = hot.reduce((s, h) => s + h.correctRate, 0) / hot.length;

  $('#cstats').innerHTML = `
    <div class="cstat hot">
      <b>${peak.replayers}</b>
      <span>最高峰重播人數 · ${fmt(peak.t)}</span>
      <em>486 人裡有 ${Math.round(peak.rate * 100)}% 倒回去重看「貝氏刷牙法」</em>
    </div>
    <div class="cstat warn">
      <b>${total.toLocaleString()}</b>
      <span>熱點總重播次數</span>
      <em>平均每人倒帶 ${(total / D.cohort.n).toFixed(1)} 次才聽懂</em>
    </div>
    <div class="cstat ${acc < 0.5 ? 'hot' : 'ok'}">
      <b>${Math.round(acc * 100)}%</b>
      <span>熱點題平均答對率</span>
      <em>低於 5 成 —— 學員不只是沒記住，是理解錯了</em>
    </div>
    <div class="cstat ok">
      <b>${Math.round(D.cohort.completionRate * 100)}%</b>
      <span>完課率</span>
      <em>業配段是最大的流失點（見下方）</em>
    </div>
    <div class="cstat ai">
      <b>${D.clips.length}</b>
      <span>AI 已生成的精華片段</span>
      <em>可直接發佈為補充教材或推播素材</em>
    </div>
  `;
}

/* ═════════════════════════ 共同誤解 ═════════════════════════ */
function misconceptions() {
  $('#misc').innerHTML = D.misconceptions.map((m, i) => `
    <li class="misc-row">
      <span class="misc-rank">${i + 1}</span>
      <div class="misc-main">
        <div class="misc-belief">${m.belief}</div>
        <div class="misc-meta">
          <span class="ts">${fmt(m.t)}</span>
          ${m.chapter} ·
          <b>${Math.round(m.pct * 100)}%</b> 的學員選了這個錯誤答案，
          只有 ${Math.round(m.correctRate * 100)}% 選對
        </div>
      </div>
      <div class="misc-n">
        <b>${m.people}</b>
        <span>人受影響</span>
      </div>
    </li>
  `).join('');

  // 後台不該只會罵人。
  // 「重播率高、但多數人答對」= 這段難，可是你講清楚了。難不是問題，講不清楚才是。
  const good = D.hotspots
    .filter(h => h.intervene && !h.misconception)
    .sort((a, b) => b.correctRate - a.correctRate);

  if (!good.length) return;
  $('#misc').insertAdjacentHTML('afterend', `
    <div class="good">
      <b>✓ 這幾段你講清楚了</b>
      <p class="good-lead">
        它們的重播率一樣高 —— 學員照樣倒帶了很多次。但<b>多數人答對了</b>。
        <span class="good-say">難不是問題，講不清楚才是。這兩段不用改。</span>
      </p>
      ${good.map(h => `
        <p><span class="ts">${fmt(h.t)}</span>
        <em>${h.label}</em> —— 重播率 ${Math.round(h.rate * 100)}%（很難），
        但 <b>${Math.round(h.correctRate * 100)}%</b> 的學員答對，是所有熱點裡最高的一群。</p>`).join('')}
    </div>
  `);
}

/* ═════════════════════════ 重播熱力圖 ═════════════════════════ */
function heatmap() {
  const max  = Math.max(...D.heatmap.map(b => b.replayers));
  const base = [...D.heatmap].map(b => b.replayers).sort((a, b) => a - b)[Math.floor(D.heatmap.length / 2)];

  $('#mBase').textContent = base;
  $('#mPeak').textContent = max;
  $('#mSnr').textContent  = `${(max / Math.max(base, 1)).toFixed(0)}×`;

  const color = r =>
    r < 0.06 ? '#39404f' :
    r < 0.14 ? '#5a6a86' :
    r < 0.26 ? '#c78a3a' :
    r < 0.42 ? '#ff8c3a' : '#ff4d4d';

  $('#cheat').innerHTML = D.heatmap.map(b => {
    const h = D.hotspots.find(x => Math.abs(x.t - (b.t + 2.5)) < D.cohort.bucketSec / 2);
    return `<i class="${b.sponsor ? 'skip' : ''}" ${h ? `data-h="${h.id}"` : ''}
       style="--hh:${Math.max(2, (b.replayers / max) * 130).toFixed(1)}px;--hb:${color(b.rate)}"
       data-tip="${fmt(b.t)} · ${b.replayers} 人重播（${Math.round(b.rate * 100)}%）"></i>`;
  }).join('');

  const d = D.course.duration;
  $('#cheatAxis').innerHTML = [0, .25, .5, .75, 1]
    .map(p => `<span>${fmt(d * p)}</span>`).join('');
}

/* ═════════════════════════ 業配段 ═════════════════════════
   這一段是「反向證據」。它證明重播數量到的是理解困難，不是流量。 */
function sponsor() {
  const s = D.sponsor;
  const inSp = D.heatmap.filter(b => b.sponsor);
  const avg  = Math.round(inSp.reduce((a, b) => a + b.replayers, 0) / inSp.length);

  $('#sponsorBox').innerHTML = `
    <header class="cbox-h">
      <h2>⚠️ 業配段：${fmt(s.start)} – ${fmt(s.end)}</h2>
      <p>這段的重播數是全課最低（平均 <b>${avg}</b> 人／格）—— 而跳過率是全課最高。</p>
    </header>
    <div class="sp-row">
      <div class="sp-big">
        <b>${Math.round(s.skipRate * 100)}%</b>
        <span>跳過率</span>
      </div>
      <div class="sp-tx">
        沒有人會倒回去重看業配 —— 這件事本身就是好消息：
        它證明<b>重播訊號量到的是「理解困難」，不是「有多少人在看」</b>。
        如果重播數只是播放量的影子，這 83 秒不會塌成一條平線。
        <br><br>
        但代價是真的：業配落在課程<b>中段</b>（第 6 分 37 秒，剛講完最精華的貝氏刷牙法），
        有 <b>${Math.round(s.dropRate * 100)}%</b> 的學員在這裡直接離開，沒看到後面的「我們的觀點」。
        <span class="sp-fix">
          把業配移到片尾，或縮短到 40 秒。
          你把它放在最精華的內容之後 —— 那是留存曲線最脆弱的位置。
        </span>
      </div>
    </div>
  `;
}

/* ═════════════════════════ 逐點診斷 ═════════════════════════
   排序用「受影響人數」—— 最多人卡在哪，就排最前面。這是最誠實的排法。

   不用 ROI（人數 ÷ 成本）排序，因為那會把「全課最嚴重的問題」推到第四名去，
   只因為它比較難改。難改不代表不重要 —— 那是創作者自己要權衡的事，不是我替他決定的。
   成本與影響照樣標出來，另外把「低成本 + 中高影響」的標成 CP 值最高，讓他一眼挑得到。 */
function diagnostics() {
  const sorted = [...D.hotspots].sort((a, b) => b.replayers - a.replayers);
  const cheap  = h => h.effort === '低' && h.impact !== '低';

  $('#diag').innerHTML = sorted.map((h, i) => {
    const clip = D.clips.find(c => c.hotspot === h.id);
    return `
      <div class="dg ${i < 3 ? 'top' : ''} ${h.intervene ? '' : 'quiet'}">
        <div class="dg-top">
          <span class="dg-ts">${fmt(h.t)}</span>
          <span class="dg-kind">${h.kindLabel}</span>
          <span class="dg-chapter">${h.chapter}</span>
          ${cheap(h) ? '<span class="dg-cp">🎯 CP 值最高</span>' : ''}
          ${h.intervene ? '' : '<span class="dg-quiet">未達介入門檻 · 學員端不打擾，也沒有投票資料</span>'}
          <span class="dg-num">
            <b>${h.replayers}</b><span>人重播 · ${Math.round(h.rate * 100)}% · 平均 ${h.avgReplays} 次</span>
          </span>
        </div>

        <div class="dg-label">${h.label}</div>

        <div class="dg-cols">
          <div class="dg-cell why">
            <b>為什麼卡住</b>
            ${h.diagnosis}
          </div>
          <div class="dg-cell fix">
            <b>怎麼改</b>
            ${h.fix}
          </div>
        </div>

        <div class="dg-foot">
          <span class="dg-chip e-${h.effort}">改善成本 <b>${h.effort}</b></span>
          <span class="dg-chip">預期影響 <b>${h.impact}</b></span>
          ${!h.intervene
            ? '<span class="dg-chip">無投票資料</span>'
            : h.misconception
              ? `<span class="dg-chip hot">共同誤解 <b>${h.misconception.people} 人</b></span>`
              : `<span class="dg-chip ok">多數人答對（${Math.round(h.correctRate * 100)}%）· 難但講清楚了</span>`}
          ${clip
            ? `<a class="dg-link" href="index.html?open=reels&i=${D.clips.indexOf(clip)}">
                 AI 已剪好 ${Math.round(clip.dur)} 秒精華 →</a>`
            : ''}
        </div>
      </div>`;
  }).join('');
}

/* ═════════════════════════ 已生成素材 ═════════════════════════ */
function assets() {
  $('#assets').innerHTML = D.clips.map((c, i) => `
    <a class="asset" href="index.html?open=reels&i=${i}">
      <div class="asset-thumb" style="--img:url('assets/thumbs/${c.id}.jpg')">
        ${c.replayers ? `<i>↺ ${c.replayers}</i>` : ''}
        <b>${Math.round(c.dur)}s</b>
      </div>
      <div class="asset-tx">
        <strong>${c.title}</strong>
        <span>${c.chapter}${c.kindLabel ? ` · ${c.kindLabel}` : ''}</span>
      </div>
    </a>
  `).join('');
}
