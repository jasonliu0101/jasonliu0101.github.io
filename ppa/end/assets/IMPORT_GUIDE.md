# 素材導入指南

## 🖼️ 你收集的素材清單

根據對話中的圖片，以下是需要保存和重命名的素材：

### ✅ 已確認的素材

#### 📋 功能圖標 (icons/)
1. **task-list.svg** - 藍紫色任務清單圖標
2. **notebook.svg** - 黃色圈圈筆記本（附鉛筆）
3. **flashcard.svg** - 綠色卡片堆疊（附星星）
4. **video-play.svg** - 紫色視頻播放器
5. **ai-robot.svg** - 白藍色 AI 機器人

#### 🏅 徽章系列 (badges/)
1. **level-badge.svg** - 金色盾牌等級徽章（LV）
2. **star-coin.svg** - 金色星星硬幣
3. **achievement-level.svg** - 金色絲帶獎牌（LV）

---

## 💾 保存步驟

### 方法 1：使用瀏覽器（推薦）
```
1. 在這個對話中右鍵點擊圖片
2. 選擇 "另存圖片為..." 或 "Save image as..."
3. 選擇目標資料夾：
   - public/assets/icons/          (圖標)
   - public/assets/badges/         (徽章)
   - public/assets/illustrations/  (插圖)
4. 輸入新名稱（使用上面的建議名稱）
5. 存檔
```

### 方法 2：使用終端機
```bash
# 進入專案目錄
cd /Users/xuyujie/Desktop/VS\ Code/AWS/learning-city

# 查看已保存的素材
ls -la public/assets/icons/
ls -la public/assets/badges/

# 檢查素材統計
find public/assets -type f | wc -l
```

---

## 📝 重命名完成清單

將以下項目複製，在保存時使用：

### Icons (功能圖標)
```
☐ task-list.svg
☐ notebook.svg
☐ flashcard.svg
☐ video-play.svg
☐ ai-robot.svg
```

### Badges (徽章)
```
☐ level-badge.svg
☐ star-coin.svg
☐ achievement-level.svg
```

---

## 🔗 集成到組件

### 1. 在 DailyTasksList 中使用圖標

```tsx
// src/components/learning/DailyTasksList.tsx
const taskIcons = {
  review: '🔄',
  watch: '📹',
  quiz: '❓',
  note: '📝',
};

// 或改用圖片
const taskIcons = {
  review: '/assets/icons/task-list.svg',
  watch: '/assets/icons/video-play.svg',
  quiz: '/assets/icons/quiz.svg',
  note: '/assets/icons/notebook.svg',
};
```

### 2. 在建築卡片中使用徽章

```tsx
// src/components/city/InteractiveCityV2.tsx
<image 
  href="/assets/badges/level-badge.svg"
  x={...}
  y={...}
/>
```

### 3. 在 ReviewModals 中使用圖標

```tsx
// src/components/review/ReviewModals.tsx
// 已使用的圖標位置，可替換為 SVG 圖片
<img src="/assets/icons/task-list.svg" alt="測驗" />
```

---

## 🎨 設計規範

### 圖標尺寸
- **小圖標**：32x32px - 40x40px (按鈕內)
- **中圖標**：48x48px - 64x64px (卡片標題)
- **大圖標**：96x96px+ (首頁展示)

### 色彩規範
- 保持一致的調色板
- 使用 SVG 便於更改顏色
- 建議在 SVG 中使用 currentColor 以支持深色主題

### 文件格式
- **推薦**：SVG（可縮放、輕量）
- **備選**：PNG 透明背景（需多個尺寸）
- **避免**：JPG（有損壓縮）

---

## 📊 素材組織檢查表

素材收集完後，運行以下命令驗證：

```bash
# 查看 icons 資料夾
cd public/assets/icons && ls -lh

# 查看 badges 資料夾
cd public/assets/badges && ls -lh

# 查看 illustrations 資料夾
cd public/assets/illustrations && ls -lh

# 生成完整清單
find public/assets -type f -name "*.svg" | sort
```

---

## ✨ 下一步

1. ✅ 保存所有圖片到正確的資料夾
2. ✅ 確認命名正確無誤
3. ⏳ 更新 React 組件以使用這些素材
4. ⏳ 測試深色/淺色主題的呈現
5. ⏳ 優化 SVG 文件大小

需要幫助時參考此指南！

