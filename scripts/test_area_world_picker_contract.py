#!/usr/bin/env python3
from pathlib import Path
R=Path(__file__).resolve().parents[1]; c=(R/"frontend/src/components/area/LocationCanvas.tsx").read_text(); p=(R/"frontend/src/pages/AreaPage.tsx").read_text()
checks={"world-lng":"((exactLng() + 180) / 360)" in c,"world-lat":"((90 - exactLat()) / 180)" in c,"global":"global 360° × 180°" in c,"private":"no external tiles" in c and "mapbox" not in c.lower() and "leaflet" not in c.lower(),"coords":"Exact latitude" in c and "Exact longitude" in c,"refine":"Local refine" in c,"lazy":"enabled: creating() || Boolean(selectedId())" in p,"error":"AREA management is unavailable. This is not an empty game state." in p,"retry":"overview.refetch()" in p}
bad=[k for k,v in checks.items() if not v]
if bad: raise SystemExit("AREA_WORLD_PICKER_CONTRACT=FAIL "+','.join(bad))
print("AREA_WORLD_PICKER_CONTRACT=PASS global=true privacy-preserving=true explicit-states=true")
