# New Class: Warlock (咒术师)

## Design Philosophy

The five existing classes each occupy a distinct strategic niche:

| Class | Niche | Core Loop |
|-------|-------|-----------|
| Assassin | Burst damage | High Ji rate -> high-level attacks |
| Tank | Attrition | Absorb hits -> reactive Ji/abilities |
| Mage | Resource burst | Defense -> accumulate orbs -> release |
| NSYC | Delayed guarantee | Passive stacks -> guaranteed hit |
| Dog | Volatility | Luck-driven random swings |

**Warlock fills the missing niche: Sustained Drain.**

The warlock places curse stacks on the enemy through normal play (both attacking AND defending contribute), then chooses when to cash them in for burst damage + self-healing. This creates a unique decision loop: *harvest early and often, or wait for a massive payoff?*

No other class puts persistent debuffs on the enemy. This inverts the usual "build my own resource" pattern into "corrupt the opponent."

---

## Identity

| Field | Value |
|-------|-------|
| **Key** | `warlock` |
| **Icon** | `👻` |
| **Name** | 咒术师 |
| **Trait** | 诅咒侵蚀，汲取为生 |
| **Passive Desc** | 攻击命中或防御时，对敌方施加1层诅咒。诅咒层数越高，噬魂越强。 |
| **SP Desc** | 噬魂：消耗敌方全部诅咒（至少4层），造成 层数/2（向上取整）点伤害并回复1HP。 |

---

## Base Stats

| Stat | Value | Reasoning |
|------|-------|-----------|
| **Base HP** | 4 | Moderate — needs to survive long enough to stack curses, but shouldn't out-tank the Tank |
| **Base Ji Rate** | 2 | Moderate — same as Mage. Enough to mix attacks and defense without feeling starved |
| **Ability Tree** | Free-pick | Allows strategic adaptation; same style as NSYC and Dog |

**Starting Luck**: 0 (default)

---

## Core Mechanic: Curse Stacks (诅咒层数)

Curse stacks are placed on the **enemy**, not the player. Stored as `G.enemy.curseStacks`.

### Accumulation Rules

| Trigger | Stacks Gained | Condition |
|---------|---------------|-----------|
| Player attack **hits** | +1 | Attack level > enemy defense level |
| Player uses **paid defense** (defense_1 or defense_2) | +1 | Only when Ji is spent on defense; free defense_0 does NOT grant stacks |
| Round start (passive) | +0 | No free stacks — must earn them |

### Properties

- Stacks have **no cap** (theoretically unlimited, practically 1-3 per round)
- Stacks **reset to 0** at battle end (unless `grudge` ability unlocked)
- Stacks are **visible** to the player as a UI tag on the enemy portrait
- Enemy AI is **not aware** of curse stacks (does not change behavior)

### Pacing Estimate

Typical stack accumulation per round:
- Attacking round (hit): +1
- Defending round: +1
- Mixed (attack miss): +0

Expected: ~1 stack/round on average. Reach 4 stacks around round 4-5. This feels right — similar pacing to Mage's 5-orb requirement.

---

## Special Action: Soul Devour (噬魂)

| Field | Value |
|-------|-------|
| **Key** | `soul_devour` |
| **Type** | `attack` |
| **Cost** | 0 Ji |
| **Stack Cost** | Consumes ALL curse stacks (minimum 4) |
| **Attack Level** | 0 (bypasses defense — guaranteed to connect) |
| **Defense Level** | 2 (moderate self-protection while casting) |
| **Hits** | 0 (damage is applied directly, not through hit resolution) |
| **Damage** | ceil(consumed_stacks / 2) |
| **Heal** | 1 HP |
| **Emoji** | `💀` |

### Why This Design

- **Guaranteed damage**: Like NSYC's ekai, the damage is not blockable. This is the payoff for patient accumulation.
- **Scaling**: Unlike ekai's fixed damage, Soul Devour scales with patience. 4 stacks = 2 dmg, 6 stacks = 3 dmg, 8 stacks = 4 dmg.
- **Self-heal**: Small but meaningful. Sustain is the warlock's identity.
- **Defense while casting**: def:2 provides some protection during the casting turn, unlike ekai's def:3. Lower because the warlock already gets curse stacks from defending.
- **Immediate resolution**: Damage applies THIS round (not next round like ekai). This feels more satisfying and fits the "drain" fantasy.

### Resolution Flow

1. Player selects `soul_devour`
2. On resolve: consume all `G.enemy.curseStacks`
3. Calculate damage: `Math.ceil(consumed / 2)`
4. Apply damage to enemy (bypasses defense)
5. Heal player 1 HP (clamped to maxHp)
6. Log: `💀 噬魂：吞噬 {consumed} 层诅咒，造成 {damage} 点伤害，回复 1 HP。`

---

## Ability Tree (4 abilities, free-pick)

### 1. Grudge (怨念)

| Field | Value |
|-------|-------|
| **Key** | `grudge` |
| **Icon** | `🔗` |
| **Cost** | 1 fragment |
| **Effect** | Curse stacks on the enemy persist across battles (not reset on battle end). On new battle start, transfer min(stacks, 3) to the new enemy. |

**Design intent**: Rewards long-term planning. If you overkill curses on a weak enemy, the surplus carries forward. The cap of 3 prevents snowballing.

### 2. Siphon (虹吸)

| Field | Value |
|-------|-------|
| **Key** | `siphon` |
| **Icon** | `🩸` |
| **Cost** | 1 fragment |
| **Effect** | Soul Devour heals additional HP: +1 per 4 consumed stacks (total heal = 1 + floor(consumed/4)). |

**Design intent**: Amplifies the sustain identity. At 4 stacks: heal 1+1=2. At 8 stacks: heal 1+2=3. Makes waiting for big stacks more attractive.

### 3. Plague (瘟疫)

| Field | Value |
|-------|-------|
| **Key** | `plague` |
| **Icon** | `☠️` |
| **Cost** | 2 fragments |
| **Effect** | At round start, if enemy has 3+ curse stacks, enemy loses 1 Ji. |

**Design intent**: Passive disruption. Creates pressure even before Soul Devour is ready. The Ji drain slows the enemy's ability to use high-level attacks, synergizing with the warlock's mid-game control style. Higher cost because this effect is very strong in long fights.

### 4. Soul Return (回魂)

| Field | Value |
|-------|-------|
| **Key** | `soulReturn` |
| **Icon** | `🌀` |
| **Cost** | 1 fragment |
| **Effect** | Once per run: when HP would drop to 0, if enemy has 2+ curse stacks, consume all stacks and survive with 1 HP. |

**Design intent**: Safety net, similar to Assassin's `savedByBlade`. Thematically: the warlock tears the enemy's cursed life force to cheat death. Requires curse stacks to function, so it's not a free revive — you had to be actively cursing.

---

## UI Requirements

### Battle Screen

1. **Enemy curse stacks indicator**: A tag/badge near the enemy portrait showing current curse stack count. Format: `☠ {count}` with a purple/dark color scheme.

2. **Special action card**: `soul_devour` appears in the Special (技能) sub-panel, same position as `mage_release` / `ekai`. Disabled (grayed out) when `curseStacks < 4`.

3. **Ability tree panel**: 4 ability cards in free-pick layout (same as NSYC/Dog). Each shows icon, name, cost, and description.

### Class Selection Screen

- Button: `<button class="class-btn" data-class="warlock">👻<br>咒术师</button>`
- Positioned after existing 5 classes

### Combat Log Messages

| Event | Log Class | Message |
|-------|-----------|---------|
| Curse gained (attack hit) | `log-ab` | `☠ 诅咒：命中敌方，施加1层诅咒（当前{n}层）` |
| Curse gained (defense) | `log-ab` | `☠ 诅咒：黑暗气息侵蚀敌方，施加1层诅咒（当前{n}层）` |
| Soul Devour | `log-ab` | `💀 噬魂：吞噬{consumed}层诅咒，造成{damage}点伤害，回复1HP。` |
| Plague Ji drain | `log-ab` | `☠️ 瘟疫：敌方被诅咒侵蚀，失去1Ji。` |
| Soul Return | `log-ab` | `🌀 回魂：撕裂诅咒之力，死里逃生！消耗{consumed}层诅咒，以1HP存活。` |
| Grudge carry | `log-ab` | `🔗 怨念：残余诅咒随你进入战斗，敌方继承{n}层诅咒。` |

---

## Enemy AI Interaction

- Enemy AI does **not** react to curse stacks (no behavioral changes)
- Boss AI treats warlock the same as other classes
- Taunt (Tank ability) has no special interaction with warlock
- Silence Gold (沉默是金 relic) CAN disable `soul_devour`

---

## Balance Considerations

### Compared to Similar Mechanics

| | Mage Release | Ekai | Soul Devour |
|---|---|---|---|
| **Resource** | 5 lightning orbs | 4 foolishness stacks | 4+ curse stacks |
| **Accumulation** | Defense only | Passive each round | Attack hit OR defense |
| **Damage** | 1 (+focus bonus) | 1 (+hazuki bonus) | ceil(stacks/2) |
| **Timing** | Immediate, blockable | Next round, guaranteed | Immediate, guaranteed |
| **Defense while casting** | 0 | 3 | 2 |
| **Healing** | None | None | 1 HP (+siphon bonus) |
| **Scaling** | Fixed | Fixed | Variable (2-4+ dmg) |

### Strengths
- Sustained damage + healing = strong in long fights
- Flexible accumulation (attacking AND defending contribute)
- Scaling damage rewards patience

### Weaknesses
- Slow start — no damage pressure until round 4-5
- No burst potential in early rounds (unlike Assassin)
- Lower max HP than Tank (4 vs 10)
- Curse stacks reset per battle (without Grudge ability)
- No guaranteed hit on normal attacks (unlike high-Ji Assassin)

### Expected Power Level
- **vs Elites**: Strong. Long fights favor curse accumulation.
- **vs Bosses**: Strong. Drain + sustain is valuable in extended fights.
- **vs Regular enemies**: Average. Fights end before curses fully ramp up.
- **Overall**: Mid-to-high tier. Rewards patient play.

---

## Implementation Checklist

### Data Layer
- [ ] Add `warlock` to `CLASS_DEFS` in `data.js`
- [ ] Add `soul_devour` action in `logic.js` (`getActionData`)
- [ ] Add `curseStacks` initialization in `state.js`
- [ ] Add ability state keys: `grudge`, `siphon`, `plague`, `soulReturn`, `soulReturnUsed`

### Combat Effects
- [ ] Register curse-on-hit effect in `hitResolution.js` or `techEffects.js`
- [ ] Register curse-on-defense effect in `defaultResolveEffects.js`
- [ ] Register `plague` round-start effect in `defaultRoundStartEffects.js`
- [ ] Register `soulReturn` death effect in `defaultDeathEffects.js`
- [ ] Register `grudge` battle-end carry effect
- [ ] Register `soul_devour` resolution in `logic.js` (`resolveAction`)

### UI Layer
- [ ] Add class button in `index.html`
- [ ] Add `soul_devour` to special action keys in `main.js`
- [ ] Add curse stacks display tag on enemy portrait
- [ ] Add warlock to ability tree rendering
- [ ] Add warlock to class intro screen
- [ ] Update experimental battle UI card rendering

### Order Constants
- [ ] Add `WARLOCK_PLAGUE` to `ROUND_START_ORDER` in `order.js`
- [ ] Add `WARLOCK_SOUL_RETURN` to death effect order
