# 素材資料夾結構

根據網頁設計需求整理的素材分類

## 📁 資料夾結構

```
public/assets/
├── icons/              # 功能圖標 (40-60px)
│   ├── task-list.svg              # 任務清單圖標 (藍色)
│   ├── notebook.svg               # 筆記本圖標 (黃色)
│   ├── flashcard.svg              # 學習卡圖標 (綠色)
│   ├── video-play.svg             # 視頻播放圖標 (紫色)
│   ├── quiz.svg                   # 測驗圖標
│   └── ai-robot.svg               # AI 助教機器人圖標
│
├── badges/             # 徽章和獎勵 (60-120px)
│   ├── level-badge.svg            # 等級徽章 (金色)
│   ├── star-coin.svg              # 星星硬幣 (金色)
│   └── achievement.svg            # 成就徽章
│
├── illustrations/      # 插圖和角色 (200px+)
│   ├── building-bank.svg          # 建築卡片 - 銀行
│   ├── building-office.svg        # 建築卡片 - 辦公室
│   ├── empty-state.svg            # 空狀態插圖
│   └── success-animation.svg      # 成功動畫
│
└── buildings/          # 城市建築素材 (isometric)
    ├── bank.svg                   # 投資銀行 (藍色)
    ├── office.svg                 # 職場辦公 (灰藍色)
    ├── language-school.svg        # 語言學院 (紫色)
    ├── bakery.svg                 # 烘焙工坊 (橘色)
    ├── beauty-salon.svg           # 美妝沙龍 (粉色)
    ├── gym.svg                    # 健身房 (綠色)
    ├── lifestyle.svg              # 生活創意 (黃色)
    └── digital-center.svg         # 數位科技 (青綠色)
```

## 🎨 命名規則

### Icon 命名 (icons/)
- 用途-類型.svg
- 例：`task-list.svg`, `flashcard.svg`, `quiz.svg`

### Badge 命名 (badges/)
- 類型-版本.svg
- 例：`level-badge.svg`, `star-coin.svg`

### Illustration 命名 (illustrations/)
- 描述-狀態.svg
- 例：`building-bank.svg`, `empty-state.svg`, `success-animation.svg`

### Building 命名 (buildings/)
- 建築名-顏色代碼.svg
- 例：`bank-blue.svg`, `office-gray.svg`

## 📥 如何保存素材

1. **將圖片另存為**：右鍵點擊圖片 → "另存圖片為"
2. **選擇格式**：建議使用 `.svg` 格式（可縮放、文件小）
3. **放入相應資料夾**
4. **命名遵循規則**

## 🔗 使用方式

在 React 組件中引用：

```tsx
// 圖標
<img src="/assets/icons/task-list.svg" alt="任務清單" />

// 建築
<img src="/assets/buildings/bank-blue.svg" alt="銀行" />

// 徽章
<img src="/assets/badges/level-badge.svg" alt="等級" />
```

## 📋 色彩代碼參考

| 建築 | 主色 | 副色 |
|------|------|------|
| 投資銀行 | #6ba3d6 | #4a7ab3 |
| 職場辦公 | #7d8fb3 | #5a6a8a |
| 語言學院 | #9b88c4 | #7a67a3 |
| 烘焙工坊 | #f0b775 | #d4945f |
| 美妝沙龍 | #e89db7 | #cc7ca1 |
| 健身房 | #a8d5a8 | #8ab98a |
| 生活創意 | #ffd580 | #e6c168 |
| 數位科技 | #6bbfb5 | #4fa39b |

