# P0 战斗基线与接口

基线为 Git 标签 `p0-baseline`，提交 `9382650ce4a624407a82b4377c24a6b853352934`。冻结前用独立的 Chrome headless 上下文从职业选择进入战斗，完成了咒术师的蓄力、同级互攻和付费防御三个回合。为观测连续回合，固定了地图随机序列并将首个对手的初始生命调为 10。浏览器捕获和从该提交直接运行原效果注册表得到的边界案例，分别保存在 `tests/fixtures/warlock-baseline.json` 和 `tests/fixtures/engine-baseline.json`。

像素战斗草稿 PR #2 的独立基线是 `319b13144b9e775344fbcbf27d5dff8979498b2c`，本地标签为 `archive/pr-2-pixel-runner`。它可在 P1 的交互实验中作为独立版本重测。

## 冻结版本的运行路径

```text
index.html → main.js → state.js + 地图、队伍及构筑状态
                  ├─ 界面、键盘、出牌确认 → ai.js + logic.js
                  └─ battle/runtime.js → battle/flow.js → battle/engine.js
                                        └─ 职业、战技、装备及遗物效果
                                            ├─ hitResolution.js
                                            └─ damagePipeline.js
```

| 状态 | 基线证据 |
| --- | --- |
| 已模块化 | `battle/engine.js` 按阶段、作用方、顺序和效果 ID 执行效果。`battle/flow.js` 声明阶段链。命中比较、命中钩子、伤害包与加乘修正分别在 `hitResolution.js` 和 `damagePipeline.js` 中。装备定义、装备状态及效果注册在 `equipment/`，战技定义在 `battleTechniques.js`。 |
| 模块内依赖全局状态 | `logic.js` 读取 `G` 来查费用、职业资源及结算动作。`ai.js` 通过 `G` 读取规则和 Boss 记忆。各效果注册模块也直接读写 `G`。阶段引擎可独立创建，整场战斗仍需共享同一个游戏状态。 |
| 规则嵌在界面流程 | `main.js` 初始化战斗并处理虎式坦克、小血瓶、雷暴、怨念；确认按钮中检查合法性、调用 AI，延时回调驱动揭示、结算、死亡检查和下一回合。委托代理、狩猎律动的消耗与伤害、火焰流星雨的免费追加也有规则代码在 DOM 回调中。 |
| UI 入口 | `render.js` 负责默认界面和状态展示，`experimentalBattleUi.js` 负责实验手牌界面。两者在 `main.js` 汇入同一确认和结算路径。 |

职业规则分布在多层。刺客的名刀进入死亡阶段、暴击进入命中钩子；法师的释放和防御电球在动作逻辑，集中、电动力学在命中阶段；坦克的战技费用在动作定义，重甲伤害在战技钩子，虎式坦克在入场处理；厄介职业的叠层、延迟伤害和小狗的幸运分别跨动作、回合开始与受伤阶段；咒术师的叠诅咒、噬魂、瘟疫及回魂分别覆盖动作、命中、回合开始和死亡阶段，怨念跨战斗传递。

## 技术债

- `backup/main.js` 没有网页入口，保留旧 MDP 和直接 `calcDamage` 调用。现行 `main.js` 使用规则 AI，`src/mdp.js` 及预生成策略表未进入当前浏览器依赖图。现行 `calcDamage` 兼容导出也未被该依赖图调用。实际阶段链分别调用命中比较与命中后计算。
- `BATTLE_END` 有常量但未纳入阶段链。地图进度、胜负画面、奖励、跨房间清理仍由浏览器流程负责。P0 战斗状态在地图奖励和清空房间资源前截止。
- `main.js` 与渲染层都曾判断行动可用性，菜单禁用与最终提交的边界容易出现差异。P0 将最终提交校验收进同一项战斗规则。
- 冻结版本按作用方先后执行回合开始效果。常规回合中，玩家侧「沉默是金」先抽取禁用行动，随后系统侧清空该列表。P0 保留原效果顺序。是否修复这项行为应作为单独的规则决定。
- 冻结版本的地图重试快照可能递归保留上一份检查点。P0 快照省略前一个检查点，并保留当时的战斗所需状态。
- 咒术师和部分敌人缺少独立立绘，现有界面使用表情回退。立绘补齐属于素材工作。

## Node.js 战斗接口

使用 Node.js 24 运行 `npm test`，无第三方依赖。网页入口仍是 `index.html`，使用任意静态 HTTP 服务即可预览。

```js
import {
  createBattle,
  getLegalActions,
  getBattleResult,
  getBattleRecording,
  replayBattle,
  resolveTurn,
  startBattleRecording,
} from './src/battle/core.js';

const battle = createBattle({ classKey: 'warlock', enemy: 'gufu' }, 42);
startBattleRecording(battle);
const playerAction = getLegalActions(battle, 'player')[0];
const turn = resolveTurn(battle, playerAction, 'ji');
const recording = getBattleRecording(battle);
const replay = replayBattle(JSON.parse(JSON.stringify(recording)));
console.log(turn.resolution.phaseTrace, getBattleResult(replay.state));
```

- `createBattle(config, seed)` 接受职业、敌人、难度、天赋、遗物、战技、装备及商店强化。敌人可以是既有 Boss、精英和普通敌人的 ID，也可以是完整敌人对象。用 `initial.player`、`initial.enemy` 和 `initial.battle` 设置测试起点，初始回合效果在这些设置后执行。
- `getLegalActions(state, actor)` 返回 `player` 或 `enemy` 的可提交行动键。敌方行动省略时用现有 AI。持有委托代理遗物时，传 `null` 作为玩家行动可走原代理策略。
- `resolveTurn` 修改传入的状态并返回双方行动、伤害结果、实发效果及胜负。遇到追击时，`pending` 为 `hunt` 或 `free`。调用 `resolveBattleChoice(state, 'hit')` 或 `resolveBattleChoice(state, 'finish')` 继续。
- `snapshotBattle` 返回可 JSON 序列化的战斗检查点。录制包含初始检查点、种子、双方实际行动、追击选择、伤害、日志和阶段效果。回放重新执行并校验每个步骤。核心效果和策略各用一条可序列化的随机流；地图生成、商店和奖励仍用各自原有的随机来源。
- 浏览器会从战斗入场开始录制。开发者工具中可用 `(await import('./src/battle/core.js')).getBattleRecording((await import('./src/state.js')).G)` 读取当前战斗记录。记录在进入下一场战斗时更新。

## 验证范围

- Node.js 回归覆盖 Ji 获取及花费、攻防级别相等与突破、双方同回合归零、战技与遗物的伤害修正顺序、复活和即死的优先关系、付费追击以及种子回放。
- 默认界面与实验手牌界面分别在独立 Chrome headless 上下文中实际出牌。将浏览器生成的记录交给 Node.js 回放，对比玩家、敌人、战斗和天赋状态。浏览器验证逐个运行。
- GitHub Actions 工作流 `Battle rules` 在指向 `main` 的 PR 和 `main` 推送时执行 `npm test`。对应的合并门禁使用同名检查。
