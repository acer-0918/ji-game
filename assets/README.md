# 资源目录说明

## 立绘 portraits/
角色和 Boss 的立绘图片，建议尺寸 200×220px，透明背景 PNG。

| 文件名             | 用途       | 对应元素 ID              |
|--------------------|------------|--------------------------|
| player_assassin.png | 刺客立绘   | b-player-portrait-img    |
| player_tank.png    | 坦克立绘   | b-player-portrait-img    |
| player_mage.png    | 法师立绘   | b-player-portrait-img    |
| enemy_jiaxu.png    | Boss 贾诩  | b-enemy-portrait-img     |
| enemy_gufu.png     | Boss 古夫  | b-enemy-portrait-img     |
| enemy_faultrobot.png | Boss 故障机器人 | b-enemy-portrait-img |
| enemy_basic.png    | 普通敌人   | b-enemy-portrait-img     |

**替换方法：**
1. 将图片放入此目录
2. 在 `index.html` 对应的 `<img class="portrait-img">` 上设置 `src`
3. 给外层 `portrait-frame` 加上 `has-art` class

示例（在 main.js 的 startBattle 函数中动态设置）：
```js
const img = document.getElementById('b-enemy-portrait-img');
img.src = `assets/portraits/enemy_${G.enemy.id}.png`;
document.getElementById('b-enemy-portrait').classList.add('has-art');
```

---

## 主行动卡面 cards/main/
4 张主卡牌的卡面图，建议尺寸 56×56px，透明背景 PNG。

| 文件名       | 用途   | 对应按钮 ID |
|--------------|--------|-------------|
| card_ji.png  | 蓄力   | mb-ji       |
| card_def.png | 防御   | mb-def      |
| card_atk.png | 攻击   | mb-atk      |
| card_sp.png  | 特殊   | mb-sp       |

**替换方法：**
给 `action-card-btn` 加 `has-art` class，设置内部 `<img class="acb-img">` 的 src。

---

## 子技能卡面 cards/sub/
各技能的卡面图，建议尺寸 44×44px，透明背景 PNG。

| 文件名         | 用途      | 对应按钮 ID |
|----------------|-----------|-------------|
| def_0.png      | 防御      | sb-d0       |
| def_1.png      | 超防      | sb-d1       |
| def_2.png      | 无敌防    | sb-d2       |
| atk_1.png      | 攻击1     | sb-a1       |
| atk_2.png      | 攻击2     | sb-a2       |
| atk_3.png      | 攻击3     | sb-a3       |
| atk_4.png      | 攻击4     | sb-a4       |
| atk_5.png      | 攻击5     | sb-a5       |
| atk_6.png      | 攻击6     | sb-a6       |
| atk_7.png      | 攻击7     | sb-a7       |
| sp_mage_release.png | 一重释放 | sb-sp1   |

**替换方法：**
给 `sub-card` 加 `has-art` class，设置内部 `<img class="sub-card-img">` 的 src。
