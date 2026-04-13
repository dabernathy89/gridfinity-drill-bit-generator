# Gridfinity Drill Bit Generator

A web-based generator for a 3d-printed drill bit storage device that fits into a Gridfinity baseplate.

## Concept

The system separates the mechanical parts (hinge and baseplate) from the storage parts (bit trays). Print the universal hinge base once, then generate and print a new tray whenever your drill bit set changes — no re-printing the whole mechanism.

## Components

- **Universal Hinge Base** — a static print-in-place chassis that mounts directly onto a Gridfinity baseplate. Includes a cone hinge, 90° tactile detent, standard-sized magnet recesses on the underside for secure attachment to magnetic baseplates, and a female dovetail slot.
- **Parametric Bit Tray** — generated on demand to match your exact bit set, with staggered rows, embossed size labels, and a male dovetail rail that slides into the base.

## Generator

The web tool lets you enter your bit set (metric or imperial), pick bin dimensions in Gridfinity units, preview the tray in 3D, and download a print-ready STL. A separate static STL for the hinge base is available for one-time download.

## Design Goals

- **Secure mounting** — baseplate interface with magnet recesses keeps the hinge anchored when the tray is tilted up.
- **Supportless printing** — 45° overhangs and print-in-place geometry throughout.
