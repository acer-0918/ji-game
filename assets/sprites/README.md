# Runner battle sprite profiles

The runner battle UI uses direction-specific 4×4 atlases (16 frames), not general-purpose character sheets.

## Current profiles

- `runner-assassin.png`: player at the bottom, running toward the top edge.
- `runner-mage.png`: player at the bottom, running toward the top edge.
- `runner-enemy.png`: enemy at the top, charging toward the bottom edge.
- `*-source.png`: flat magenta source atlases retained for future re-keying and frame alignment work.

Each transparent atlas is played by the `runner-sprite-16` CSS animation in `styles/main.css`. Player profile mapping lives in `src/experimentalBattleUi.js`; unsupported classes intentionally fall back to their existing portrait with a lightweight motion loop.

## Adding another character

1. Generate exactly 16 coherent poses in a 4×4 atlas for the character's actual lane direction.
2. Keep one shared scale, center anchor, and baseline across all cells.
3. Use a flat chroma background and remove it into a transparent PNG.
4. Check the atlas at the in-game display size; direction readability matters more than illustration detail.
5. Add the transparent atlas to `PLAYER_SPRITE_PROFILES`.

Attack slashes, shields, charge rings, damage numbers, particles, camera shake, and audio are runtime effects. They are intentionally separate from the locomotion atlases so combat feedback can scale with action type and damage.
