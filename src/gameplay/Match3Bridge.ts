/**
 * Match3Bridge — keeps the 2D Match3 module board in sync with the
 * 3D cube grid rendered by SceneManager.
 *
 * After every player swap in Match3Module, the bridge:
 *   1. pulls the latest board from the module
 *   2. tells the SceneManager to re-render the grid
 *   3. asks the SceneManager to flash the matched cells
 *
 * The bridge is engine-agnostic: it talks to the scene through a
 * small interface, so it's unit-testable.
 */

export interface Match3BoardView {
    rows: number;
    cols: number;
    cells: number[];
}

export interface Match3BridgeActions {
    renderMatch3Grid(cells: number[], rows: number, cols: number): void;
    flashMatch3Cells(cells: Array<[number, number]>, durationMs?: number): void;
}

export class Match3Bridge {
    private actions: Match3BridgeActions;
    private getBoard: () => Match3BoardView | null;
    private getMatches: () => Array<Array<[number, number]>>;
    private lastCellsJson: string = '';
    private lastMatchesCount: number = 0;

    constructor(actions: Match3BridgeActions, getBoard: () => Match3BoardView | null, getMatches: () => Array<Array<[number, number]>>) {
        this.actions = actions;
        this.getBoard = getBoard;
        this.getMatches = getMatches;
    }

    /**
     * Push the current state of the Match3 module to the 3D scene.
     * Returns true if the scene was actually re-rendered (caller
     * can use this to avoid redundant work).
     */
    sync(): boolean {
        const b = this.getBoard();
        if (!b) return false;
        const sig = b.cells.join(',') + `|${b.rows}x${b.cols}`;
        if (sig === this.lastCellsJson) return false;
        this.lastCellsJson = sig;
        this.actions.renderMatch3Grid(b.cells, b.rows, b.cols);
        return true;
    }

    /**
     * Flash the cells that are currently matching. Returns the
     * number of cells flashed.
     */
    flashMatches(): number {
        const matches = this.getMatches();
        if (matches.length === this.lastMatchesCount) return 0;
        this.lastMatchesCount = matches.length;
        for (const group of matches) {
            this.actions.flashMatch3Cells(group, 500);
        }
        return matches.reduce((n, g) => n + g.length, 0);
    }
}
