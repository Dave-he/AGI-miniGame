/**
 * Round 151 — biome hotkey context map.
 *
 * Before round 151, the `BIOME_HOTKEYS` constant lived inline in
 * `src/main.ts` (declared at module load alongside the App class).
 * That made the map untestable in isolation — any change to the
 * map (adding/removing a biome, tweaking a binding) had to be
 * verified through the full App + HUD render path, with no way
 * to assert lookup contracts like "all 6 BiomeIds resolve to a
 * non-null context" or "an unknown biomeId resolves to null".
 *
 * Round 151 extracts the map + a small lookup helper into this
 * dedicated module so the lookup contract can be pinned with
 * unit tests. The shape of the entries is identical to what
 * `HUD.setBiomeHotkeys` already accepts (a `label: string` plus
 * a `bindings` array of `{ key, action, group? }`), so the two
 * `main.ts` call sites that consume `getBiomeHotkeyContext` only
 * need a one-line import change.
 *
 * Biome coverage: 6 biomes total, matching
 * `BiomeLibraryPanel`'s canonical display order
 * (`cyberpunk, forest, desert, ice, space, dungeon`).
 * Before round 151 only the first 4 were mapped; round 151
 * backfills `space` and `dungeon`. The empty-string key maps
 * to `null` so the welcome hub and any "no biome" path keeps
 * its existing null-strip behaviour. Unknown biome ids also
 * resolve to `null` via the `?? null` fallback at the call
 * site (Map.get returns undefined for missing keys, which is
 * then coerced to null at the boundary).
 */

export interface BiomeHotkeyBinding {
    key: string;
    action: string;
    group?: string;
}

export interface BiomeHotkeyContext {
    label: string;
    bindings: ReadonlyArray<BiomeHotkeyBinding>;
}

const BIOME_HOTKEYS: ReadonlyMap<string, BiomeHotkeyContext | null> = new Map<
    string,
    BiomeHotkeyContext | null
>([
    [
        'forest',
        {
            label: '森林',
            bindings: [
                { key: '1', action: '伐木', group: '采集' },
                { key: '2', action: '种树', group: '采集' },
                { key: '3', action: '篝火', group: '生存' },
            ],
        },
    ],
    [
        'desert',
        {
            label: '沙漠',
            bindings: [
                { key: '1', action: '挖井', group: '采集' },
                { key: '2', action: '沙堡', group: '建造' },
                { key: '3', action: '绿洲', group: '探索' },
            ],
        },
    ],
    [
        'cyberpunk',
        {
            label: '赛博',
            bindings: [
                { key: '1', action: '黑客', group: '入侵' },
                { key: '2', action: '机甲', group: '战斗' },
                { key: '3', action: '芯片', group: '升级' },
            ],
        },
    ],
    [
        'ice',
        {
            label: '冰原',
            bindings: [
                { key: '1', action: '凿冰', group: '采集' },
                { key: '2', action: '雪橇', group: '移动' },
                { key: '3', action: '火把', group: '生存' },
            ],
        },
    ],
    // Round 151 backfill: space and dungeon. These two biomes
    // were known to WfcBiomes and BiomeLibraryPanel but had no
    // hotkey bindings, so the round-150 biome strip rendered
    // null for them. Adding them here closes the 4→6 coverage
    // gap. Bindings follow the same 3-keys/2-3-groups pattern
    // as the other biomes.
    [
        'space',
        {
            label: '星域',
            bindings: [
                { key: '1', action: '跃迁', group: '航行' },
                { key: '2', action: '扫描', group: '探索' },
                { key: '3', action: '护盾', group: '战斗' },
            ],
        },
    ],
    [
        'dungeon',
        {
            label: '地牢',
            bindings: [
                { key: '1', action: '开锁', group: '潜行' },
                { key: '2', action: '陷阱', group: '战斗' },
                { key: '3', action: '宝箱', group: '探索' },
            ],
        },
    ],
    // Welcome hub and unknown biomes get null so the biome
    // strip is hidden (the round-150 setBiomeHotkeys(null, null)
    // contract removes the strip entirely).
    ['', null],
]);

/**
 * Look up the hotkey context for a given biome id. Returns
 * `null` when the biome id is unknown OR the map explicitly
 * stores `null` for that id (the welcome-hub case). Returns
 * the full context (label + bindings) otherwise.
 *
 * The boundary coercion `?? null` matters: `Map.get` returns
 * `undefined` for missing keys, but `HUD.setBiomeHotkeys`'s
 * null-check is `hotkeys == null` which treats `undefined` and
 * `null` identically — yet the type annotation on the map is
 * `BiomeHotkeyContext | null`, not `BiomeHotkeyContext |
 * undefined`. Coercing here keeps the type honest.
 */
export function getBiomeHotkeyContext(biomeId: string): BiomeHotkeyContext | null {
    return BIOME_HOTKEYS.get(biomeId) ?? null;
}

/**
 * For tests + diagnostics: list every biome id that maps to a
 * non-null context (i.e. the biomes that will render a hotkey
 * strip). Excludes the explicit-null '' key.
 */
export function listMappedBiomeIds(): ReadonlyArray<string> {
    const ids: string[] = [];
    for (const [id, ctx] of BIOME_HOTKEYS) {
        if (ctx !== null && id !== '') ids.push(id);
    }
    return ids;
}
