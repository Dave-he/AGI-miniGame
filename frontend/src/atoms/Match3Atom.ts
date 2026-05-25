import { Atom, AtomPhase } from '../core/Atom';
import type { AtomContext } from '../core/Atom';

const GEM_COUNT = 6;
const BOARD_SIZE = 8;

export class Match3Atom extends Atom {
    readonly atomId = 'match3';
    readonly atomName = '三消';
    readonly atomVersion = 1;

    private board: number[][] = [];
    private combo: number = 0;
    private animating: boolean = false;

    onInit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Initialized;
        this._score = 0;
        this.combo = 0;
        this.animating = false;
        this.board = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            this.board[r] = [];
            for (let c = 0; c < BOARD_SIZE; c++) {
                this.board[r][c] = this.randomGem();
            }
        }
        this.removeInitialMatches();
    }

    onEnter(ctx: AtomContext): void {
        this.phase = AtomPhase.Running;
        ctx.sharedData['board'] = this.board;
    }

    onUpdate(_ctx: AtomContext): void {
        if (this.animating) return;
    }

    onExit(_ctx: AtomContext): void {
        this.phase = AtomPhase.Completed;
    }

    onDestroy(): void {
        this.board = [];
    }

    onPause(ctx: AtomContext): void {
        super.onPause(ctx);
    }

    onResume(ctx: AtomContext): void {
        super.onResume(ctx);
    }

    saveState(): Record<string, any> {
        return { board: this.board, score: this._score, combo: this.combo };
    }

    loadState(state: Record<string, any>): void {
        this.board = state.board ?? [];
        this._score = state.score ?? 0;
        this.combo = state.combo ?? 0;
    }

    handleEvent(event: string, data: Record<string, any>, _ctx: AtomContext): void {
        if (event === 'swap') {
            const row1 = data.row1 as number;
            const col1 = data.col1 as number;
            const row2 = data.row2 as number;
            const col2 = data.col2 as number;
            this.swap(row1, col1, row2, col2);
        }
    }

    swap(row1: number, col1: number, row2: number, col2: number): boolean {
        if (!this.isAdjacent(row1, col1, row2, col2)) return false;
        const temp = this.board[row1][col1];
        this.board[row1][col1] = this.board[row2][col2];
        this.board[row2][col2] = temp;
        const matches = this.findMatches();
        if (matches.length === 0) {
            this.board[row2][col2] = this.board[row1][col1];
            this.board[row1][col1] = temp;
            return false;
        }
        this.combo = 0;
        this.processChain();
        return true;
    }

    findMatches(): { row: number; col: number }[] {
        const matched = new Set<string>();
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE - 2; c++) {
                const gem = this.board[r][c];
                if (gem === this.board[r][c + 1] && gem === this.board[r][c + 2]) {
                    matched.add(`${r},${c}`);
                    matched.add(`${r},${c + 1}`);
                    matched.add(`${r},${c + 2}`);
                }
            }
        }
        for (let r = 0; r < BOARD_SIZE - 2; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const gem = this.board[r][c];
                if (gem === this.board[r + 1][c] && gem === this.board[r + 2][c]) {
                    matched.add(`${r},${c}`);
                    matched.add(`${r + 1},${c}`);
                    matched.add(`${r + 2},${c}`);
                }
            }
        }
        return Array.from(matched).map(s => {
            const [row, col] = s.split(',').map(Number);
            return { row, col };
        });
    }

    processChain(): void {
        let matches = this.findMatches();
        while (matches.length > 0) {
            this.combo++;
            const comboMultiplier = 1 + (this.combo - 1) * 0.5;
            const points = Math.floor(matches.length * 10 * comboMultiplier);
            this._score += points;
            for (const m of matches) {
                this.board[m.row][m.col] = -1;
            }
            this.applyGravity();
            this.fill();
            matches = this.findMatches();
        }
    }

    applyGravity(): void {
        for (let c = 0; c < BOARD_SIZE; c++) {
            let writeRow = BOARD_SIZE - 1;
            for (let r = BOARD_SIZE - 1; r >= 0; r--) {
                if (this.board[r][c] !== -1) {
                    this.board[writeRow][c] = this.board[r][c];
                    if (writeRow !== r) {
                        this.board[r][c] = -1;
                    }
                    writeRow--;
                }
            }
            for (let r = writeRow; r >= 0; r--) {
                this.board[r][c] = -1;
            }
        }
    }

    fill(): void {
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (this.board[r][c] === -1) {
                    this.board[r][c] = this.randomGem();
                }
            }
        }
    }

    getBoard(): number[][] {
        return this.board.map(row => [...row]);
    }

    getCombo(): number {
        return this.combo;
    }

    private randomGem(): number {
        return Math.floor(Math.random() * GEM_COUNT);
    }

    private isAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
        return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
    }

    private removeInitialMatches(): void {
        let matches = this.findMatches();
        let attempts = 0;
        while (matches.length > 0 && attempts < 100) {
            for (const m of matches) {
                this.board[m.row][m.col] = this.randomGem();
            }
            matches = this.findMatches();
            attempts++;
        }
    }
}
