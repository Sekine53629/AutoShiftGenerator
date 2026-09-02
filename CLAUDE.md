# CLAUDE.md — AutoShiftGenerator (Tier 3)

Project-specific rules. Tier 1 (`GitHub/CLAUDE.md`) and Tier 2 (`GitHub/GAS/CLAUDE.md`)
apply first; nothing here contradicts them.

---

## What this project is

A port of the Excel VBA `Auto_Shift_Generator` (11 modules, ~8,900 lines) to
Google Apps Script + Google Sheets. It builds a pharmacy staff shift roster.

**Read `docs/GAS-PORTING-SPEC.md` before writing any code.** It is the contract
for this port: module mapping, sheet schema, the placement algorithm step by step,
formula incompatibilities, and the trap checklist (§10).

---

## The port is a port, not a rewrite

The placement algorithm must produce the **same output as the VBA version for the
same input**. Do not "improve" it while porting.

- If a ported step disagrees with the VBA version, treat it as a bug in the port.
- Improvements are a separate change, made after the port is verified.
- When a judgement call is needed, read the VBA source as the source of truth:
  `GitHub/VBA/Auto_Shift_Generator/src/*.bas` — **read-only**. Never modify it
  (Tier 1: no cross-project modification).

Every function carries a `移植元:` line in its JSDoc naming the VBA procedure it
came from. Keep it accurate when you implement or rename.

---

## Hard rules for this codebase

### `Engine.gs` never touches `SpreadsheetApp`

The placement engine is a pure function: arrays in, arrays out. This is what makes
the port testable and what keeps it inside the 6-minute limit. The VBA version read
`mGrid.Cells(i,j).Value` mid-process in five places (§8.3-1) — those all become
reads of the `existing[][]` array captured up front.

If you find yourself needing a sheet value inside the engine, the value belongs in
`input` instead.

### Read and write in whole ranges, once

`getValues` / `getFormulas` / `getBackgrounds` / `getFontWeights` before the process,
`setValues` / `setBackgrounds` / `setFontWeights` after it. `flush()` once at the end.
Never per-cell in a loop (Tier 2 prohibits it, and here it also breaks the time limit).

### `Layout.resolveLayout()` is called once per execution

Resolve positions once and pass the object around. The VBA version re-resolved on
every call; that pattern does not survive the port.

### Existing input is never overwritten

`ST_FWORK` / `ST_FOFF` (cells the user already filled) are read-only to every
automatic step. The whole promise of the tool is "fill the blanks, keep what I typed."

### Constants live in `Config.gs`

No sheet name, label, column number, row offset, ID, or URL anywhere else
(Tier 1 "No Hard-Coded Paths", Tier 2 "Configuration").

### Never write a real doctor's or staff member's name into code

Doctor names come from the config sheet or from what is already on the shift sheet.
`Survey.gs` masks names (`MASK_NAMES`). This is a live workplace tool with real
personal data in it.

---

## GAS-specific gotchas that have already bitten this port

- **All `.gs` files share one global scope.** Top-level `const` and `function` names
  must be unique across the whole project. Per-file module names are therefore
  `MODULE_ENGINE`, `MODULE_LAYOUT`, … not a repeated `MODULE_NAME`.
- **`MATCH` does not accept an array in Sheets.** It silently reads only the first
  element and returns a wrong headcount with no error. The pharmacist-count formula
  uses a hidden helper column (`AN`) instead — see §5.3 and `Setup.gs`.
- **Named ranges cannot hold a formula in Sheets**, only an address. `Layout.gs` is
  the authority; named ranges are signposts for the user.
- **No cell events.** No `SelectionChange`, `BeforeDoubleClick`, `BeforeRightClick`.
  Click input is a sidebar that acts on the selection at the moment a button is pressed.
- **No Japanese-era (和暦) number format.** Western year only.

---

## Conventions

- Function names: camelCase English. Japanese only in menu labels, UI text, sheet
  names, and comments (Tier 2).
- A trailing `_` means "internal to this module" (GAS convention: such functions are
  not exposed to `google.script.run` or the trigger menu).
- Stubs call `notImplemented_(module, func, phase)` where `phase` is the
  implementation phase from spec §9. Grep `TODO(P3)` to find what is left in a phase.
- Every implemented function gets `try/catch` + `console.error` (Tier 2). Stubs do
  not — add it when you write the body.
- Call `logSuccess()` on normal completion. The VBA-era practice of judging test
  results from the log continues here. Include `elapsedMs` for the auto-generation run.

---

## Verifying the port (phase 3)

Because the engine is pure, correctness can be checked mechanically:

1. Run the VBA version on real (anonymised) data, dump `mPlan` / `mSymb` to JSON.
2. Feed the same input to `runEngine()` and diff `plan` / `symbol`.
3. Any difference is a porting bug — except `CB_CHAIN_MAX_PASS`, the one limit this
   port adds that the VBA version does not have (documented in README).

Do not skip this. It is the only practical way to know the port is right.
