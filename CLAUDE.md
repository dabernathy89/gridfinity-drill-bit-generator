# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

At project-init stage: only `README.md` and this file exist. No source, no package manifest, no tooling yet. First implementation work will be scaffolding the Vue 3 app described below.

## Product concept

Web tool that generates 3D-printable drill bit tray STLs. The system deliberately splits two parts:

- **Universal Hinge Base (Part A)** — static chassis, distributed as a *pre-made* STL. Print-in-place (PIP) cone hinge, 90° tactile detent, female 60° dovetail slot. **Mounts directly onto a Gridfinity baseplate** via magnet recesses on the underside — it does **not** drop into a bin.
- **Parametric Bit Tray (Part B)** — *generated on demand* by the web tool from the user's bit list. Staggered two-row layout, embossed size labels, male 60° dovetail rail that slides into Part A.

The dovetail is the contract between the two parts. The hinge-base geometry is a fixed spec; don't redesign it alongside the tray.

## Mechanical specs (generator must honor)

| Feature | Value |
| --- | --- |
| Hinge type | PIP cone, interlocking |
| Hinge clearance | 0.3mm radial / 0.2mm axial |
| Dovetail angle | 60° |
| Dovetail fit offset | 0.15–0.20mm |
| Drill hole tolerance | bit Ø + 0.4mm |
| Overhangs | ≤ 45°, fully supportless |
| Gridfinity footprint | 42mm × 42mm per 1U |

Tolerances must be user-overridable at generation time (filament/printer calibration differs between PLA and PETG).

## Tech stack

- **Frontend:** Vue 3 Composition API + TypeScript
- **State:** Pinia (bit arrays, unit conversions metric↔imperial)
- **3D / CSG:** `@jscad/modeling` — browser-side, for both live preview and STL export
- **Serverless:** Cloudflare Workers
- **Persistence:** Cloudflare Durable Objects (per-user saved toolsets)

The same JSCAD model should drive both the real-time preview and the downloaded STL — don't fork the geometry between a "preview" and "export" pipeline.

## User inputs

- Set name (string)
- Bit array: list of `{ diameter, unit: metric|imperial, label }`
- Tray footprint on baseplate: width in Gridfinity U, height in 7mm units
- Calibration offsets for dovetail and hinge tolerances

Validate that the bit row fits within the selected U-width before allowing generation.

## When adding build/test commands

Update this file with the actual commands once tooling lands. Don't pre-populate with guessed ones.
