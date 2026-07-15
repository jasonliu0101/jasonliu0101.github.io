#!/usr/bin/env python3
"""
把 sample/subtitle.srt + sample/video.mp4 打包成播放介面要吃的 course.json。

──────────────────────────────────────────────────────────────────────
訊號是「重複播放」，不是暫停。這個選擇是刻意的：

  暫停 = 雜訊很多。可能是接電話、去倒水、被主管叫走。
  重播 = 只有一個意思 ——「我剛剛沒聽懂，倒回去再聽一次」。

所以重播熱力圖的基線很低（沒有人會無聊亂倒帶），峰值卻很尖。
訊噪比高，這才有資格拿來當「AI 助教該在哪一秒出現」的依據。

峰值落在四種認知負荷上 —— 數字密集、專有名詞首次出現、學術引用、操作步驟。
其中操作步驟（貝氏刷牙法、牙線 C 字形）最高，因為那是唯一會讓人
「倒回去、放下手機、真的照著做一次」的內容。

反過來，業配段是低谷：沒有人會倒回去重看業配。
這條低谷是這個訊號有鑑別力的證據 —— 如果重播數只是「播放量的影子」，
業配段不會塌下去。它塌了，代表我們量到的是理解困難，不是流量。
──────────────────────────────────────────────────────────────────────
重播只告訴你「這裡難」。要知道「大家錯在哪」，得問。

所以每個熱點配一題即時投票，而且**公開全班的作答分布**。這一張分布圖同時餵三個人：

  學員   → 看到「63% 的同學第一次也答錯」，就不會覺得是自己笨。挫折感是會勸退人的。
  同儕   → 看到「你和 165 位同學選了一樣的答案」，孤獨的學習變成有人陪。
  創作者 → 如果**最多人選的是錯的**，那就是全班的共同誤解 —— 這是後台最值錢的一格。
"""
import json
import math
import random
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRT = ROOT / "sample" / "subtitle.srt"
VIDEO = ROOT / "sample" / "video.mp4"
OUT = ROOT / "prototype" / "data" / "course.json"

RNG = random.Random(20260714)  # 固定種子：demo 每次跑出來都一樣

COHORT = 486            # 模擬學員數
BUCKET = 5              # 熱力圖每格秒數
INTERVENE_RATE = 0.30   # 重播率超過這條線，AI 助教才主動跳出來

# 不同卡關類型，會被倒回去看幾次才懂
AVG_REPLAYS = {"procedure": 2.6, "citation": 2.1, "jargon": 1.9, "numbers": 1.7}

KIND_LABEL = {
    "numbers":   "數字記不住",
    "jargon":    "名詞沒定義",
    "citation":  "來源想確認",
    "procedure": "步驟要照做",
}


# ═══════════════════════════════════════════════════════════ SRT
def parse_srt(path: Path):
    def to_sec(ts: str) -> float:
        h, m, rest = ts.split(":")
        s, ms = rest.split(",")
        return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000

    cues = []
    for block in re.split(r"\n\s*\n", path.read_text(encoding="utf-8").strip()):
        lines = [ln for ln in block.strip().splitlines() if ln.strip()]
        if len(lines) < 3:
            continue
        start, end = [t.strip() for t in lines[1].split("-->")]
        cues.append({
            "i": int(lines[0]),
            "start": round(to_sec(start), 3),
            "end": round(to_sec(end), 3),
            "text": " ".join(lines[2:]).strip(),
        })
    return cues


def video_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return round(float(out.stdout.strip()), 2)


# ═══════════════════════════════════════════════════════════ 章節
# 影片自帶章節卡（逐字稿裡的【...】），我再補開場與結尾，湊成課程目錄
CHAPTERS = [
    {"t": 0.0,     "title": "台灣每 10 個成年人，8 個有牙周病"},
    {"t": 26.476,  "title": "刷牙流血不是「上火」，是警訊"},
    {"t": 63.864,  "title": "大部分人都刷錯了牙？"},
    {"t": 144.159, "title": "這樣刷牙，刷不乾淨反傷牙"},
    {"t": 209.523, "title": "只用牙刷，遠遠不夠"},
    {"t": 284.169, "title": "科學潔牙的三個步驟"},
    {"t": 397.453, "title": "升級你的潔牙裝備"},
    {"t": 480.667, "title": "我們的觀點：能持續才是關鍵"},
    {"t": 535.168, "title": "課後思考：你要調整什麼？"},
]


# ═══════════════════════════════════════════════════════════ 重播熱點
PEAKS = [
    {"id": "h1", "t": 84,  "amp": 154, "sigma": 9,  "kind": "numbers",
     "label": "三個數字連發：80.4%、9 成、高出一倍"},
    {"id": "h2", "t": 163, "amp": 198, "sigma": 10, "kind": "jargon",
     "label": "「牙齦溝」第一次出現，沒有定義就往下講"},
    {"id": "h3", "t": 218, "amp": 121, "sigma": 8,  "kind": "numbers",
     "label": "牙刷只清得到 6 成、用牙線的不到 1 成"},
    {"id": "h4", "t": 238, "amp": 176, "sigma": 8,  "kind": "citation",
     "label": "引用 Cochrane 文獻回顧，「多減少 21%」是跟誰比？"},
    {"id": "h5", "t": 297, "amp": 312, "sigma": 13, "kind": "procedure",
     "label": "貝氏刷牙法：45 度角、兩顆兩顆、來回 10 下"},
    {"id": "h6", "t": 340, "amp": 247, "sigma": 12, "kind": "procedure",
     "label": "牙線要彎成 C 字形，上下刮 —— 光聽的做不出來"},
    {"id": "h7", "t": 368, "amp": 88,  "sigma": 9,  "kind": "jargon",
     "label": "沖牙機的適用族群一次講了五種"},
]

# 業配段：重播塌陷，但跳過率飆高
SPONSOR = {"start": 397.453, "end": 480.667, "skipRate": 0.87, "dropRate": 0.23}


def build_heatmap(duration: float):
    buckets = []
    for b in range(math.ceil(duration / BUCKET)):
        t = b * BUCKET
        mid = t + BUCKET / 2

        # 基線很低 —— 這正是重播優於暫停的地方：沒有人會無聊亂倒帶。
        base = RNG.randint(5, 19)
        if mid < 26 or mid > 545:                              # 片頭動畫、片尾
            base = RNG.randint(1, 5)
        if SPONSOR["start"] <= mid < SPONSOR["end"]:           # 沒人重看業配
            base = RNG.randint(1, 6)

        n = base
        for p in PEAKS:
            n += p["amp"] * math.exp(-((mid - p["t"]) ** 2) / (2 * p["sigma"] ** 2))

        replayers = int(round(min(n, COHORT * 0.72)))
        buckets.append({
            "t": t,
            "replayers": replayers,
            "rate": round(replayers / COHORT, 4),
            "sponsor": SPONSOR["start"] <= mid < SPONSOR["end"],
        })
    return buckets


def chapter_at(t: float) -> str:
    title = CHAPTERS[0]["title"]
    for c in CHAPTERS:
        if c["t"] <= t:
            title = c["title"]
    return title


# ═══════════════════════════════════════════════════════════ 熱點內容
# 每個熱點三套內容，講給三種人聽：
#
#   poll             → 學員，先猜一次。答完才看解說（測驗效應：先想過再看，記得比較久）
#   answer / sticky  → 學員，AI 助教的解說。一出現就攤開，不繞圈子。
#   diagnosis / fix  → 創作者。不是「學員為什麼卡住」，而是「你哪裡沒講清楚、該怎麼改」。
#
# poll 的選項百分比不是裝飾。「最多人選、而且是錯的」那一項 = 全班的共同誤解，
# 它會直接長到創作者後台的第一格去。
INTERVENTIONS = {
    "h1": {
        "poll": {
            "q": "台灣 18 歲以上成人的牙周病盛行率，大約是多少？",
            "options": [
                {"t": "約 5 成",           "pct": 0.31},
                {"t": "約 8 成（80.4%）",  "pct": 0.48, "ok": True},
                {"t": "約 3 成",           "pct": 0.21},
            ],
            "blind": "有 31% 的學員低估成一半 —— 這個數字比大家以為的嚴重得多。",
        },
        "answer": [
            "**80.4%** —— 台灣 18 歲以上成人的牙周病盛行率（衛福部）。",
            "**9 成以上** —— 35–44 歲這個年齡層，比例還會再往上衝。",
            "**近一倍** —— 這個盛行率是全球平均的將近兩倍。",
        ],
        "sticky": "記一個就好：台灣成年人，10 個有 8 個。",
        "diagnosis": "12 秒內連發三個數字，而且單位全不一樣（比率 / 年齡層 / 倍數）。"
                     "工作記憶一次裝不下三個，只好倒帶。",
        "fix": "把三個數字做成一張總表卡，停留 3 秒。至少在打「80.4%」時，"
               "把「全球平均約 40%」一起放上去做對比 —— 觀眾才不用自己在腦裡算「近一倍」是多少。",
        "effort": "低", "impact": "中",
    },
    "h2": {
        "poll": {
            "q": "刷牙時，最該被清乾淨的是哪裡？",
            "options": [
                {"t": "牙齒看得到的外側面",              "pct": 0.38},
                {"t": "牙齒和牙肉交界的那條縫（牙齦溝）", "pct": 0.45, "ok": True},
                {"t": "牙齒的咬合面",                    "pct": 0.17},
            ],
            "blind": "38% 的學員以為要刷「看得到的外側」。刷得亮 ≠ 刷得乾淨。",
        },
        "answer": [
            "**牙齦溝** = 牙齒和牙肉交界的那條小縫，深度約 1–3 mm。",
            "它是牙菌斑最愛堆積的地方，也是牙周病的**起點**。",
            "所以刷牙的目標不是把牙面刷亮 —— 是把刷毛送進這條縫。",
        ],
        "sticky": "整支影片只要記住一件事：你要刷的是那條縫，不是那顆牙。",
        "diagnosis": "「牙齦溝」是整堂課的核心名詞，但它在 02:42 第一次出現時，"
                     "口白直接用了它，沒有停下來定義。畫面上雖然有字卡，但沒有解剖圖。",
        "fix": "在首次出現時停 2 秒，補一張標示「牙齒 / 牙肉 / 中間那條縫」的解剖圖。"
               "這是全課最划算的一個修改 —— 它是後面所有內容的地基。",
        "effort": "低", "impact": "高",
    },
    "h3": {
        "poll": {
            "q": "一支牙刷，大概能清到牙齒多少面積？",
            "options": [
                {"t": "約 9 成，剩下靠漱口水",  "pct": 0.42},
                {"t": "約 6 成，剩下要靠牙線",  "pct": 0.36, "ok": True},
                {"t": "幾乎 100%，刷乾淨就好",  "pct": 0.22},
            ],
            "blind": "42% 的學員高估了牙刷 —— 以為刷完就沒事了，牙線只是「加分」。",
        },
        "answer": [
            "牙刷只能清到牙齒約 **6 成** 的面積。",
            "剩下 **4 成** 是牙縫接觸面，只有**牙線或牙間刷**碰得到。",
            "而台灣每天正確使用牙線的人，**不到 1 成**。",
        ],
        "sticky": "刷完牙，你只做完 6 成的工作。",
        "diagnosis": "兩個比例數字方向相反：「牙刷清得到 6 成」講的是工具能力，"
                     "「用牙線的不到 1 成」講的是人的行為。觀眾容易把兩者搞混。",
        "fix": "做成一張對比圖，把「工具做得到 60%」和「台灣人每天做的 <10%」"
               "放在同一張畫面上 —— 落差感自己會跳出來，不用口白解釋。",
        "effort": "低", "impact": "中",
    },
    "h4": {
        "poll": {
            "q": "「電動牙刷多減少 21% 牙菌斑」，這個研究的前提是什麼？",
            "options": [
                {"t": "只要換成電動牙刷就有",   "pct": 0.40},
                {"t": "連續使用超過 3 個月",    "pct": 0.35, "ok": True},
                {"t": "要搭配漱口水一起用",     "pct": 0.25},
            ],
            "blind": "40% 的學員以為「買了就有效」。研究的前提是連續使用 3 個月以上。",
        },
        "answer": [
            "來源是 **2014 年 Cochrane Library 的文獻回顧** —— 這是實證醫學裡證據等級最高的一種。",
            "**21%** 是「電動牙刷 vs 手動牙刷」的牙菌斑減少差距，前提是**連續使用超過 3 個月**。",
            "但影片緊接著補了一句更重要的：**刷的位置和方法，比用不用電動牙刷更關鍵**。",
        ],
        "sticky": "電動牙刷是加分題，貝氏刷牙法才是必考題。",
        "diagnosis": "引用學術來源會觸發觀眾的查證慾 ——「21% 是跟什麼比？我適用嗎？」"
                     "畫面只放了論文截圖，前提條件是用口白帶過的，觀眾抓不住就會倒帶。",
        "fix": "在打出「21%」的同時，畫面上直接標註兩個前提："
               "「vs 手動牙刷」與「連續使用 3 個月以上」。"
               "把口白裡的限定條件搬到畫面上，倒帶率通常會直接砍半。",
        "effort": "低", "impact": "中",
    },
    "h5": {
        "poll": {
            "q": "貝氏刷牙法，牙刷跟牙齦要呈幾度角？",
            "options": [
                {"t": "90 度 —— 垂直對著牙齒刷",       "pct": 0.41},
                {"t": "45 度 —— 讓刷毛輕觸牙齦溝",     "pct": 0.37, "ok": True},
                {"t": "平貼牙面，水平來回刷",          "pct": 0.22},
            ],
            "blind": "41% 的學員以為要「垂直刷」—— 這是全班最大的誤解，也是最傷牙齦的一種刷法。",
        },
        "answer": [
            "**① 角度** —— 牙刷和牙齦呈 **45 度**，讓刷毛輕輕碰到牙齦溝。",
            "**② 範圍** —— 兩顆兩顆刷，不要一次刷一整排。",
            "**③ 次數** —— 每個位置來回輕刷約 **10 下**。",
            "**④ 時間** —— 整口刷完至少 **2–3 分鐘**，一天兩次，**睡前那次最重要**。",
        ],
        "sticky": "45 度、兩顆、10 下、3 分鐘。四個數字，貼在鏡子上。",
        "diagnosis": "全課最高峰。這 30 秒塞了 4 個動作參數（角度 / 範圍 / 次數 / 時間），"
                     "而且觀眾多半是想「等一下照著做一次」才倒回去的 —— 他們在把它當說明書用。",
        "fix": "拆成 4 個分鏡，每個參數給 3 秒停留與獨立字卡。"
               "結尾再補一張「45 度 · 兩顆 · 10 下 · 3 分鐘」的總表卡 —— "
               "讓觀眾可以直接截圖貼在鏡子上，他就不必倒帶了。",
        "effort": "中", "impact": "高",
    },
    "h6": {
        "poll": {
            "q": "用牙線清一個牙縫，正確的做法是？",
            "options": [
                {"t": "塞進去、再拉出來就好",                      "pct": 0.44},
                {"t": "彎成 C 字形貼著一顆牙上下刮，再換貼隔壁那顆", "pct": 0.39, "ok": True},
                {"t": "用力上下鋸，把牙縫鋸乾淨",                  "pct": 0.17},
            ],
            "blind": "44% 的學員以為「塞進去、拉出來」就夠了 —— 那只帶得走食物殘渣，刮不掉牙菌斑。",
        },
        "answer": [
            "**不是**「塞進去、拉出來」就好 —— 那樣只清到食物殘渣，沒刮掉牙菌斑。",
            "把牙線輕貼**其中一顆**牙的側面，彎成 **C 字形**，順著牙面上下刮幾下。",
            "刮完一邊，**換貼隔壁那顆**，同樣刮一次 —— 一個牙縫要刮兩面。",
            "每清完一縫，**換一段乾淨的牙線**，不然等於把細菌搬去下一個牙縫。",
        ],
        "sticky": "一個牙縫 = 兩個面 = 刮兩次。這是最多人做錯的一步。",
        "diagnosis": "「彎成 C 字形、上下刮」是一個**手部動作**。"
                     "這是語言最傳達不了的東西 —— 講再多次，觀眾還是做不出來，只能一直倒帶看畫面。",
        "fix": "補一段 5–8 秒的手部特寫實拍（或 2D 動畫）："
               "牙線貼上牙面 → 彎成 C → 上下刮 → 換貼隔壁那顆。"
               "這一段是全課唯一「非看畫面不可」的內容，值得單獨拍。",
        "effort": "高", "impact": "高",
    },
    "h7": {
        "poll": {
            "q": "沖牙機可以完全取代牙線嗎？",
            "options": [
                {"t": "可以，水柱沖得更乾淨",              "pct": 0.36},
                {"t": "不行 —— 牙菌斑黏在牙面上，得靠牙線刮", "pct": 0.47, "ok": True},
                {"t": "可以，只要水壓開到最大",            "pct": 0.17},
            ],
            "blind": "36% 的學員以為沖牙機可以取代牙線。它是很好的輔助，但刮不掉生物膜。",
        },
        "answer": [
            "沖牙機**不能**完全取代牙線。",
            "它很適合沖出卡在牙縫的**食物殘渣**，是很好的輔助工具。",
            "但**牙菌斑**是黏在牙齒表面的生物膜 —— 得靠牙線「**刮**」才下得來。",
        ],
        "sticky": "沖牙機沖得掉「渣」，刮不掉「膜」。",
        "diagnosis": "一口氣列了五種沖牙機適用族群（矯正 / 牙周病 / 植牙 / 全口重建 / 用牙線不便）。"
                     "觀眾在對號入座，會倒回去確認自己算不算。",
        "fix": "改成一張「你是哪一種？」的條列字卡，停留 3 秒。"
               "對號入座型的內容一定要給畫面，不能只用唸的。",
        "effort": "低", "impact": "低",
    },
}


def build_hotspots(heatmap):
    spots = []
    for p in PEAKS:
        b = min(heatmap, key=lambda x: abs(x["t"] + BUCKET / 2 - p["t"]))
        iv = INTERVENTIONS[p["id"]]
        avg = AVG_REPLAYS[p["kind"]]
        poll = iv["poll"]

        # 最多人選的那一項。如果它是錯的 → 這是全班的共同誤解。
        top = max(poll["options"], key=lambda o: o["pct"])
        wrong_top = None if top.get("ok") else top
        correct = next(o for o in poll["options"] if o.get("ok"))

        spots.append({
            "id": p["id"],
            "t": p["t"],
            "replayers": b["replayers"],
            "avgReplays": avg,
            "totalReplays": int(round(b["replayers"] * avg)),
            "rate": b["rate"],
            "intervene": b["rate"] >= INTERVENE_RATE,   # 沒過門檻就不主動打擾學員
            "kind": p["kind"],
            "kindLabel": KIND_LABEL[p["kind"]],
            "label": p["label"],
            "chapter": chapter_at(p["t"]),
            # ── 學員：先猜，再看解說
            "poll": poll,
            "correctRate": correct["pct"],
            "wrongRate": round(1 - correct["pct"], 2),
            "answer": iv["answer"],
            "sticky": iv["sticky"],
            # ── 創作者：共同誤解 + 怎麼改
            "misconception": None if not wrong_top else {
                "belief": wrong_top["t"],
                "pct": wrong_top["pct"],
                "people": int(round(wrong_top["pct"] * b["replayers"])),
            },
            "diagnosis": iv["diagnosis"],
            "fix": iv["fix"],
            "effort": iv["effort"],
            "impact": iv["impact"],
        })
    return sorted(spots, key=lambda s: s["t"])


# ═══════════════════════════════════════════════════════════ 精華剪輯
# start/end 是照「語意」抓的，不是照秒數硬切 —— 每一段都必須從一句話的開頭起、
# 在一句話的結尾收。切在半句上（「記得不要只是…」）的精華，剪了等於沒剪。
CLIPS = [
    {"id": "c5", "hotspot": "h5", "start": 286.8, "end": 316.0,
     "hook": "45 度、兩顆、10 下",
     "title": "貝氏刷牙法：整支影片最該學會的 30 秒",
     "takeaway": "牙刷和牙齦呈 45 度，刷毛輕碰牙齦溝，兩顆兩顆來回刷 10 下，整口至少 2–3 分鐘。"},
    {"id": "c6", "hotspot": "h6", "start": 329.0, "end": 358.0,
     "hook": "牙線要彎成 C 字形",
     "title": "牙線不是塞進去拉出來，是「刮」",
     "takeaway": "貼著一顆牙彎成 C 字形上下刮，刮完換隔壁那顆。每清一縫就換一段乾淨的牙線。"},
    {"id": "c2", "hotspot": "h2", "start": 158.6, "end": 174.0,
     "hook": "你該刷的不是牙面",
     "title": "真正要清的地方叫「牙齦溝」",
     "takeaway": "牙齒與牙肉交界的那條縫，是牙菌斑最愛堆積的地方，也是牙周病的起點。"},
    {"id": "c4", "hotspot": "h4", "start": 228.4, "end": 250.7,
     "hook": "電動牙刷多刷掉 21%",
     "title": "Cochrane 說的 21%，前提是什麼？",
     "takeaway": "連續使用超過 3 個月才有這個差距。而且牙醫說：刷的位置和方法比工具更關鍵。"},
    {"id": "c1", "hotspot": "h1", "start": 78.5, "end": 92.5,
     "hook": "10 個人有 8 個",
     "title": "80.4%：牙周病是台灣的國民病",
     "takeaway": "18 歲以上成人盛行率 80.4%，35–44 歲衝到 9 成以上，是全球平均的近兩倍。"},
    {"id": "c3", "hotspot": "h3", "start": 209.8, "end": 228.0,
     "hook": "牙刷只清得到 6 成",
     "title": "剩下那 4 成，牙刷永遠碰不到",
     "takeaway": "牙刷只能清到約 6 成牙齒面積，牙縫得靠牙線或牙間刷。但台灣每天用的人不到 1 成。"},
    {"id": "c7", "hotspot": None, "start": 514.0, "end": 535.0,
     "hook": "能持續，才是關鍵",
     "title": "比起「哪一招最神」，先找一個做得下去的",
     "takeaway": "工具和方法可以加分，但真正決定十年後牙齒狀況的，是你能不能持續做下去。"},
]


# ═══════════════════════════════════════════════════════════ AI 筆記
NOTES = {
    "summary": "台灣 8 成成人有牙周病，問題多半不在「有沒有刷」，而在「刷哪裡、用什麼刷」。"
               "牙刷只清得到 6 成面積，真正的戰場是牙齒和牙肉交界的牙齦溝。"
               "科學潔牙 = 貝氏刷牙法（45 度角）＋ 牙線／牙間刷（C 字形刮）＋ 漱口水收尾。",
    "keyPoints": [
        {"t": 84.0,  "point": "台灣 18 歲以上成人牙周病盛行率 80.4%，35–44 歲超過 9 成，近全球平均的兩倍。"},
        {"t": 100.0, "point": "牙周病初期不會痛 —— 刷牙流血、牙齦腫，就已經是警訊，不是「上火」。"},
        {"t": 160.0, "point": "該刷的是「牙齦溝」（牙齒與牙肉的交界縫），不是看得到的牙面。"},
        {"t": 173.0, "point": "刷牙看「位置對不對」，不是「力氣夠不夠大」—— 太用力會磨損琺瑯質、造成牙齦萎縮。"},
        {"t": 185.0, "point": "刷完牙不要狂漱口：牙膏的氟化物需要停留在牙齒上才發揮防蛀效果。"},
        {"t": 215.0, "point": "牙刷只清得到約 6 成牙齒面積；牙縫得靠牙線或牙間刷 —— 但台灣每天用的人不到 1 成。"},
        {"t": 297.0, "point": "貝氏刷牙法：45 度角、兩顆兩顆、來回 10 下、整口 2–3 分鐘，睡前那次最重要。"},
        {"t": 340.0, "point": "牙線要彎成 C 字形貼著牙面上下刮，一個牙縫刮兩面，每縫換一段乾淨的線。"},
        {"t": 500.0, "point": "沖牙機和漱口水是輔助，不能取代牙線和刷牙。"},
    ],
    # 這些詞會在字幕裡被標成可點的（app.js 的 markGloss）。
    # t = 它第一次出現的時間 —— 小窗裡「回到它第一次出現的地方」就是跳這裡。
    "glossary": [
        {"term": "牙周病", "t": 68.0,
         "def": "牙齒周圍的「地基」—— 牙齦、牙周韌帶、齒槽骨 —— 被細菌感染發炎。"
                "初期不會痛，等你發現時通常已經在破壞了。嚴重時牙齒會鬆動、脫落。"},
        {"term": "牙齦溝", "t": 161.9,
         "def": "牙齒和牙肉交界的那條小縫，深度約 1–3 mm。"
                "牙菌斑最愛堆積的地方，也是牙周病的起點 —— 刷牙真正的目標。"},
        {"term": "牙菌斑", "t": 166.9,
         "def": "黏在牙齒表面的細菌生物膜。它「黏」在牙面上，不是「卡」在牙縫裡 —— "
                "所以沖牙機的水柱沖不掉，得靠牙線「刮」下來。"},
        {"term": "貝氏刷牙法", "t": 294.1,
         "def": "刷毛與牙齦呈 45 度、輕觸牙齦溝，兩顆兩顆來回輕刷約 10 下的刷牙法。"
                "整口刷完至少 2–3 分鐘。這是全課最該學會的一件事。"},
        {"term": "牙線", "t": 219.4,
         "def": "清潔牙縫的細線。牙刷碰不到的那 4 成面積，只有牙線和牙間刷進得去。"
                "用法是彎成 C 字形貼著牙面「刮」，不是塞進去、拉出來。"},
        {"term": "牙間刷", "t": 219.4,
         "def": "比牙線粗的小刷子。牙縫較大、或有做牙橋、植牙的人，比較適合用它。"},
        {"term": "沖牙機", "t": 251.7,
         "def": "用水柱沖牙縫的輔助工具。沖得掉卡住的食物殘渣，"
                "但刮不掉黏在牙面上的牙菌斑 —— 不能取代牙線。"},
        {"term": "Cochrane Library", "t": 230.7,
         "def": "實證醫學的權威資料庫。它收錄的「系統性文獻回顧」是證據等級最高的一種。"
                "影片講的「電動牙刷多減少 21% 牙菌斑」就出自這裡（2014 年）。"},
        {"term": "琺瑯質", "t": 177.0,
         "def": "牙齒最外層的保護層。刷太用力會把它磨掉，久了造成牙齦萎縮、牙根外露。"},
        {"term": "氟化物", "t": 191.1,
         "def": "牙膏裡的防蛀成分，需要在牙齒表面停留一段時間才有效 —— 所以刷完別狂漱口。"},
    ],
    "numbers": [
        {"v": "80.4%", "k": "台灣成人牙周病盛行率", "t": 83.2},
        {"v": "9 成+", "k": "35–44 歲的盛行率", "t": 87.0},
        {"v": "6 成", "k": "牙刷清得到的牙齒面積", "t": 215.4},
        {"v": "< 1 成", "k": "每天用牙線的台灣人", "t": 226.8},
        {"v": "21%", "k": "電動牙刷多減少的牙菌斑", "t": 239.9},
        {"v": "45°", "k": "刷毛對牙齦的角度", "t": 294.1},
        {"v": "2–3 分", "k": "整口刷完該花的時間", "t": 308.5},
        {"v": "2 成", "k": "會定期回診洗牙的人", "t": 127.7},
    ],
}

# 主動推播：排程理由直接從內容語意長出來。
# 影片自己說了「晚上睡前那一次最重要」—— 所以推播就排在睡前，那是行為真正會發生的時刻。
PUSH = [
    {
        "id": "p1", "when": "今晚 21:30", "kind": "rescue", "clip": "c5",
        "whenNote": "睡前 —— 影片說「睡前那次最重要」，這是你真的會去刷牙的時刻",
        "trigger": "你把「貝氏刷牙法」那段倒回去看了 3 次",
        "title": "刷牙前 30 秒，把 45 度角練起來",
        "body": "你昨天倒帶最多次的那段我剪好了 —— 30 秒，看完直接去刷。答對 1 題，連續打卡 +1 🔥",
    },
    {
        "id": "p2", "when": "3 天後 20:00", "kind": "spaced", "clip": "c6",
        "whenNote": "間隔重複第 1 輪 —— 遺忘曲線在第 3 天掉最兇",
        "trigger": "「牙線 C 字形」是全班第 2 高的重播點，你也倒帶了",
        "title": "牙線那個 C 字形，還記得怎麼彎嗎？",
        "body": "30 秒動作分解 + 1 題。不用打開電腦，滑完就好。",
    },
    {
        "id": "p3", "when": "7 天後 21:30", "kind": "completion", "clip": "c7",
        "whenNote": "間隔重複第 2 輪 —— 順便回收你沒看完的 08:51",
        "trigger": "你這堂課看到 08:51 就離開了，剩 34 秒",
        "title": "還剩 34 秒就完課了",
        "body": "最後一段在講「為什麼能持續比哪一招最神更重要」。看完解鎖下一單元。",
    },
]


def main():
    cues = parse_srt(SRT)
    duration = video_duration(VIDEO)
    heatmap = build_heatmap(duration)
    hotspots = build_hotspots(heatmap)

    for c in CLIPS:
        # 剪輯要切在「句子邊界」。收進完整落在區間內的字幕，再把 start/end 夾到頭尾那兩句上。
        # （【...】是影片裡的章節標題卡，不是口白，先濾掉）
        lines = [
            q for q in cues
            if q["start"] >= c["start"] - 0.4 and q["end"] <= c["end"] + 0.6
            and not q["text"].lstrip().startswith("【")
        ]
        if lines:
            c["start"] = round(max(0, lines[0]["start"] - 0.25), 2)
            c["end"] = round(lines[-1]["end"] + 0.35, 2)
        c["lines"] = lines
        c["dur"] = round(c["end"] - c["start"], 1)
        c["chapter"] = chapter_at(c["start"])

        h = next((h for h in hotspots if h["id"] == c["hotspot"]), None)
        c["replayers"] = h["replayers"] if h else None
        c["kindLabel"] = h["kindLabel"] if h else None

    # 共同誤解排行（後台第一格）。
    # 兩個過濾條件，缺一不可：
    #   intervene      —— 沒過門檻的熱點，學員端根本不會跳出投票，也就沒有作答資料。
    #                     拿沒有資料的東西去跟創作者講「大家都答錯」，那是編的。
    #   misconception  —— 只有「最多人選、而且是錯的」才叫共同誤解。
    #                     如果多數人選對了，那只代表這段難，不代表你講錯。
    # 排序依「受影響人數」，不是百分比：一個 80% 的誤解出現在沒人看的段落，
    # 不如一個 40% 的誤解出現在全班都倒帶的段落。
    misc = sorted(
        [{**h["misconception"], "t": h["t"], "id": h["id"], "chapter": h["chapter"],
          "correctRate": h["correctRate"], "replayers": h["replayers"]}
         for h in hotspots if h["misconception"] and h["intervene"]],
        key=lambda m: m["people"], reverse=True,
    )

    payload = {
        "course": {
            "unit": "1.4",
            "title": "潔牙的科學：為什麼你天天刷牙，還是有牙周病",
            "series": "口腔健康自救手冊：牙菌斑 x 牙周病｜每天 3 分鐘，護住用一輩子的牙",
            "instructor": "志祺七七",
            "plan": "限定方案",
            "publishedAt": "2025/12/17 17:00",
            "views": 4959,
            "claps": 99,
            "comments": 13,
            "attachments": 1,
            "duration": duration,
            "src": "assets/video.mp4",
            "cover": "assets/cover.jpg",
            "sourceNote": "示範素材：志祺七七《科學潔牙》，僅作 hackathon 原型展示用",
        },
        "cohort": {
            "n": COHORT, "bucketSec": BUCKET, "interveneRate": INTERVENE_RATE,
            "signal": "replay",
            "completionRate": 0.61,
            "avgWatch": 0.74,
        },
        "chapters": CHAPTERS,
        "cues": cues,
        "heatmap": heatmap,
        "hotspots": hotspots,
        "misconceptions": misc,
        "sponsor": SPONSOR,
        "clips": CLIPS,
        "notes": NOTES,
        "push": PUSH,
        # demo 用：這位使用者「上次」看到哪、把哪幾段倒回去重看
        "me": {
            "lastPosition": 531.0,
            "myReplays": [85.0, 164.0, 295.0, 299.0, 302.0, 341.0],
        },
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")

    peak = max(heatmap, key=lambda b: b["replayers"])
    base = sorted(b["replayers"] for b in heatmap)[len(heatmap) // 2]
    iv = [h for h in hotspots if h["intervene"]]
    print(f"✓ {OUT.relative_to(ROOT)}")
    print(f"  影片 {duration}s · 字幕 {len(cues)} 條 · 熱力圖 {len(heatmap)} 格 · 熱點 {len(hotspots)} 個")
    print(f"  最高峰 {peak['t']}s：{peak['replayers']}/{COHORT} 人重播（{peak['rate']:.0%}）")
    print(f"  中位數基線 {base} 人 —— 訊噪比 {peak['replayers'] / max(base, 1):.1f}×（暫停訊號做不到這麼乾淨）")
    print(f"  AI 主動介入 {len(iv)} 點：" + "、".join(f"{h['id']}@{int(h['t'])}s({h['rate']:.0%})" for h in iv))
    print(f"  共同誤解 TOP3：")
    for m in misc[:3]:
        print(f"    · {m['people']:>3} 人以為「{m['belief']}」（{m['pct']:.0%}）@ {int(m['t'])}s")


if __name__ == "__main__":
    main()
