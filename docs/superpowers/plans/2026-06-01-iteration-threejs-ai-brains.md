# AGI-miniGame Iteration Plan: 2026-06-01

## Goal
Close the gap between the PRD and the current TypeScript implementation, and fix the
blocking compile error in `cocos4-rust` so the game can actually run end-to-end.

## Engine layer (cocos4-rust)

### 1. Fix the JS-in-RawString termination bug
**File:** `cocos4-rust/src/game/game.rs`
**Issue:** The JS bootstrap source from line 507 is wrapped in `r#"..."#` but contains
literal `"#GameCanvas"` and `"#gameCanvas"` JS strings which prematurely terminate the
Rust raw string, causing 9 compile errors.
**Fix:** Change the opening delimiter to `r##"`, and the matching closing `"#;` to `"##;`.
This only affects the **prelude** raw string (lines 507–3678). Other raw string blocks
in the same file do not contain `"#` sequences and stay as `r#"..."#`.

### 2. Re-export `agi_minigame::atoms` from a single `register_all` entry
**File:** `cocos4-rust/src/lib.rs`
**Change:** Add `pub use agi_minigame::atoms::register_all_atoms;` so game-layer code
(AGI-miniGame or `game-demo`) can register all 6 gameplay atoms in one call.

## Game layer (AGI-miniGame)

### 3. Add the 3 missing AI brains to `src/ai/AIEngine.ts`
- `GameplayCombinerAI` — pick a combination of atoms based on player level & history.
- `ContentGeneratorAI` — generate theme name, color palette, BGM mood, intro lore.
- `SmartWorldAI` — generate WorldEvents (weather, NPC chatter, dimension modifiers).
Wire all four into a unified `AIEngine` facade that `GameManager` already calls.

### 4. Add `MemeCompiler.ts` to fulfill `docs/.../2026-05-25-agi-minigame-core.md` Task 4
**File:** `AGI-miniGame/src/dsl/MemeCompiler.ts`
- `combineMemes(memes: string[]): string` — builds the AGI prompt.
- `parseDSL(dsl: string): Rule` — TypeScript mirror of the Rust parser so the
  game layer can validate before calling into WASM.

### 5. Add a minimal Three.js scene manager
**File:** `AGI-miniGame/src/scene/SceneManager.ts`
- Boots a Three.js renderer into a `#game-canvas` div.
- Loads the "无限次元城" hub scene: 1 ground plane, 1 skybox, N floating cube portals.
- Renders a small HTML overlay HUD with current dimension name, score, AI state.

### 6. Wire the GameManager into the scene
**File:** `AGI-miniGame/src/main.ts`
- Create the SceneManager first.
- Boot the GameManager.
- On `enterNewDimension()` update the HUD and emit a "dim-changed" event the
  SceneManager listens to (placeholder for now: log to console + flash the portal
  corresponding to the dominant atom).

## Acceptance
- `cargo check` in `cocos4-rust` passes (no errors).
- `npm run build` in `AGI-miniGame` produces a `dist/` without TS errors.
- A new unit test in `AGI-miniGame/frontend/tests/` exercises `MemeCompiler.combineMemes`.
- A new unit test in `AGI-miniGame/src/ai/` exercises `AIEngine` with all 4 brains wired.
- `AGI-miniGame/README.md` updated with the new entry point and the new files.
