# GIF Frame Aligner

A local, static HTML tool for building aligned GIFs from still images.

## Features

- Drag/drop multiple image files (8+ frames works fine)
- Frame-by-frame alignment in a crop viewport
- Onion-skin reference overlay from frame 1 (adjustable opacity)
- Drag to reposition, scroll to zoom, arrow-key nudge
- Aspect ratio presets including square `1:1`
- Adjustable FPS
- GIF quality presets (draft/balanced/high/ultra)
- Optional highlight tone mapping for HDR-ish inputs before GIF encoding
- Download rendered GIF

## Run

Because GIF workers can be blocked by some browsers on `file://`, run a local server:

```bash
cd /Users/johno/projects/gifm
python3 -m http.server 8000
```

Then open:

[http://localhost:8000](http://localhost:8000)

## Notes

- GIF is an 8-bit format, so very bright/HDR source images need compression to look reasonable.
- `HDR Handling -> Tone-map highlights` applies an SDR-friendly tone-map curve before encoding.
- `GIF Quality` affects file size, render speed, and color quality.
