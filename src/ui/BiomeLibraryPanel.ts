/**
 * BiomeLibraryPanel — round-119 panel.
 *
 * Renders the 6 biomes from `WfcBiomes.BIOMES`
 * (cyberpunk / forest / desert / ice / space /
 * dungeon) as a small overlay inside
 * `<div id="biome-library-root">`.
 *
 * Shows:
 *   - 6 biome rows with name + floor tint color
 *     swatch
 *   - "当前" badge on the row matching the
 *     `currentBiome` arg
 *   - "未探索" badge on rows that don't match
 *
 * Auto-refreshes via a `refresh` callback the
 * host wires to a setInterval or the
 * `enterNewDimension` call site.
 *
 * Round 119 extends the round-112/113/114/115/
 * 117 7-key panel-toggle group to 8 keys
 * (P / Q / W + T / F / M + V + B). The B
 * shortcut is the primary way to open the
 * panel; the round-119 mouse button
 * (`btn-biome-library`) is the secondary way.
 *
 * The biome data is sourced from the canonical
 * `BIOMES` registry in `world/WfcBiomes.ts` —
 * no duplication. The current biome is sourced
 * from `worldState.lastBiome` (passed in as
 * `currentBiome`).
 */

import { BIOMES, type BiomeId, type BiomePalette } from '../world/WfcBiomes';

export interface BiomeLibraryPanelHandle {
    refresh(): void;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderRow(biome: BiomePalette, isCurrent: boolean): string {
    const currentBadge = isCurrent
        ? `<span class="biome-library-current">当前</span>`
        : `<span class="biome-library-untouched">未探索</span>`;
    return `
        <div class="biome-library-row${isCurrent ? ' is-current' : ''}">
            <span class="biome-library-swatch" style="background:${escapeHtml(biome.floorTint)};"></span>
            <span class="biome-library-name">${escapeHtml(biome.name)}</span>
            <span class="biome-library-mood">${escapeHtml(biome.mood)}</span>
            ${currentBadge}
        </div>
    `;
}

export function renderBiomeLibraryPanel(
    root: HTMLElement,
    currentBiome: BiomeId | null,
    i18n?: { t: (k: string, p?: any) => string },
): BiomeLibraryPanelHandle {
    const t = (k: string, params?: any) => i18n ? i18n.t(k, params) : k;

    // Preserve canonical display
    // order: cyberpunk → forest →
    // desert → ice → space → dungeon.
    const orderedIds: BiomeId[] = [
        'cyberpunk', 'forest', 'desert', 'ice', 'space', 'dungeon',
    ];

    const doRender = () => {
        const rows = orderedIds
            .map((id) => BIOMES[id])
            .filter((b): b is BiomePalette => b !== undefined)
            .map((b) => renderRow(b, b.id === currentBiome))
            .join('');
        root.innerHTML = `
            <div class="biome-library-panel">
                <div class="biome-library-title">${escapeHtml(t('biomeLibrary.title'))}</div>
                <div class="biome-library-stats">
                    <span class="biome-library-stat">当前: <b>${currentBiome ? escapeHtml(BIOMES[currentBiome]?.name ?? currentBiome) : '—'}</b></span>
                </div>
                <div class="biome-library-section-label">${escapeHtml(t('biomeLibrary.list'))}</div>
                <div class="biome-library-entries">${rows}</div>
            </div>
        `;
    };

    doRender();
    return { refresh: doRender };
}
