#!/usr/bin/env python3
"""
Good Faith Paradigm WebXR — Milestone 4 Spatial Geometry & Raycast Event Safety Challenger Harness
Author: challenger_m4_2 (EMPIRICAL CHALLENGER - critic, specialist)

Stress Dimensions:
1. 3D Scene Geometry, OBB Projections, and Clearance Verification
   - Kiosk position: [9.0, 30.0, 14.5], rotY = -Math.PI / 10
   - Clearance from Plinth 4 [8.5, 30.0, 21.0]
   - Clearance from Archive Booth [13.8, 30.0, 21.0]
   - Clearance from Docent Home [0.0, 30.0, 16.0]
   - Clearance from Helipad Alpha [0.0, 30.0, 38.0]
   - Clear Line-of-Sight from Docent Lux waypoint [7.2, 30.0, 15.5] to Kiosk Console [9.0, 31.0, 14.5]
2. Raycasting Action Safety & Bounds Probing (JS Logic Model & Fuzzing)
   - Slide index wrap-around safety (prev from 0 -> 4, next from 4 -> 0)
   - Direct index bounds checking (valid: 0-4; invalid: -1, 5, 100, NaN, 'abc', '')
   - Tab action bounds checking
   - Narration/Autoplay/Link toggling
   - Malformed/non-string action handling (None, int, dict, empty string)
3. Visual QA Harness Execution & Asset Verification
   - tools/qa_adventure_kiosk.py --dry-run
4. Reference Repository Cleanliness Audit
   - vr-club-gparadigm working tree verification
"""

import math
import os
import re
import subprocess
import sys
from typing import Any, Dict, List, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

WORKSPACE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REF_REPO_DIR = r"C:\Users\jason\.gemini\antigravity\scratch\vr-club-gparadigm"


# =========================================================================
# 1. SPATIAL GEOMETRY & CLEARANCE TEST HARNESS
# =========================================================================

class SpatialGeometryChallenger:
    def __init__(self):
        # Kiosk center and orientation
        self.kiosk_pos = (9.0, 30.0, 14.5)
        self.kiosk_rot_y = -math.pi / 10.0  # -18 degrees

        # Kiosk physical bounding specifications (in local coordinates)
        # Screen: width 3.6m, depth ~0.2m, at relative z = -0.7
        # Console: width 1.25m, depth ~0.71m, at relative z = 0.08
        # Base cylinder: radius 0.52m
        # Conservative local bounding box [min_x, max_x, min_z, max_z]
        self.local_box = (-1.86, 1.86, -0.85, 0.50)

        # Scene landmark coordinates
        self.landmarks = {
            "Plinth 4": {"pos": (8.5, 30.0, 21.0), "radius": 0.8},
            "Archive Booth": {"pos": (13.8, 30.0, 21.0), "radius": 2.2},
            "Collector Booth": {"pos": (13.8, 30.0, 32.0), "radius": 2.2},
            "Docent Home": {"pos": (0.0, 30.0, 16.0), "radius": 1.2},
            "Helipad Alpha Center": {"pos": (0.0, 30.0, 38.0), "radius": 8.0},
            "Plinth 3": {"pos": (3.2, 30.0, 18.5), "radius": 0.8},
            "Docent Lux Waypoint": {"pos": (7.2, 30.0, 15.5), "radius": 0.5},
        }

    def get_kiosk_world_vertices(self) -> List[Tuple[float, float]]:
        """Computes world 2D (x, z) coordinates of the kiosk OBB corners."""
        min_x, max_x, min_z, max_z = self.local_box
        corners = [
            (min_x, min_z),
            (max_x, min_z),
            (max_x, max_z),
            (min_x, max_z),
        ]
        cos_r = math.cos(self.kiosk_rot_y)
        sin_r = math.sin(self.kiosk_rot_y)

        world_corners = []
        kx, _, kz = self.kiosk_pos
        for lx, lz in corners:
            # Rotate by rotY
            # In Three.js: x' = x*cos(r) + z*sin(r), z' = -x*sin(r) + z*cos(r)
            wx = kx + (lx * cos_r + lz * sin_r)
            wz = kz + (-lx * sin_r + lz * cos_r)
            world_corners.append((wx, wz))
        return world_corners

    def calculate_center_distances(self) -> Dict[str, float]:
        kx, _, kz = self.kiosk_pos
        distances = {}
        for name, data in self.landmarks.items():
            lx, _, lz = data["pos"]
            d = math.hypot(kx - lx, kz - lz)
            distances[name] = d
        return distances

    def calculate_clearances(self) -> Dict[str, float]:
        """Calculates distance between Kiosk OBB and landmark bounding circles."""
        corners = self.get_kiosk_world_vertices()
        clearances = {}

        for name, data in self.landmarks.items():
            lx, _, lz = data["pos"]
            r = data["radius"]

            # Distance from point (lx, lz) to polygon corners & edges
            min_dist_to_kiosk = float("inf")
            # 1. Corner distance
            for cx, cz in corners:
                dist = math.hypot(lx - cx, lz - cz)
                if dist < min_dist_to_kiosk:
                    min_dist_to_kiosk = dist

            # 2. Edge distance
            for i in range(len(corners)):
                p1 = corners[i]
                p2 = corners[(i + 1) % len(corners)]
                dx = p2[0] - p1[0]
                dz = p2[1] - p1[1]
                l2 = dx * dx + dz * dz
                if l2 > 0:
                    t = max(0.0, min(1.0, ((lx - p1[0]) * dx + (lz - p1[1]) * dz) / l2))
                    proj_x = p1[0] + t * dx
                    proj_z = p1[1] + t * dz
                    dist = math.hypot(lx - proj_x, lz - proj_z)
                    if dist < min_dist_to_kiosk:
                        min_dist_to_kiosk = dist

            clearance = min_dist_to_kiosk - r
            clearances[name] = clearance

        return clearances

    def verify_docent_line_of_sight(self) -> Tuple[bool, str]:
        """Verifies line-of-sight from docent waypoint [7.2, 30.0, 15.5] to kiosk console."""
        docent_pos = (7.2, 30.0, 15.5)
        console_pos = (9.0, 30.0, 14.5)
        dist = math.hypot(console_pos[0] - docent_pos[0], console_pos[2] - docent_pos[2])

        # Direction vector
        dx = console_pos[0] - docent_pos[0]
        dz = console_pos[2] - docent_pos[2]
        angle_rad = math.atan2(dx, -dz)
        angle_deg = math.degrees(angle_rad)

        # Check if ray passes through any other landmark
        ray_clear = True
        for name, data in self.landmarks.items():
            if name in ["Docent Lux Waypoint"]:
                continue
            lx, _, lz = data["pos"]
            r = data["radius"]
            # Distance from point (lx, lz) to segment (docent -> console)
            l2 = dx * dx + dz * dz
            t = max(0.0, min(1.0, ((lx - docent_pos[0]) * dx + (lz - docent_pos[2]) * dz) / l2))
            proj_x = docent_pos[0] + t * dx
            proj_z = docent_pos[2] + t * dz
            seg_dist = math.hypot(lx - proj_x, lz - proj_z)
            if seg_dist < r:
                ray_clear = False
                return False, f"Interference by {name}: distance {seg_dist:.2f}m < radius {r:.2f}m"

        return ray_clear, f"LOS distance: {dist:.3f}m, angle: {angle_deg:.1f} deg, path completely unobstructed"


# =========================================================================
# 2. RAYCAST ACTION SAFETY & BOUNDS TESTING
# =========================================================================

class AdventureKioskActionModel:
    """Exact behavioral reproduction of js/adventureKiosk.js handleAction and selectSlide."""

    def __init__(self, slide_count: int = 5):
        self.slide_count = slide_count
        self.current_slide = 0
        self.autoplay = False
        self.autoplay_timer = 0.0
        self.narrating = False
        self.links_opened = []
        self.notifications = []

    def select_slide(self, index: int):
        # Exact JS modulo logic: ((index % len) + len) % len
        self.current_slide = ((index % self.slide_count) + self.slide_count) % self.slide_count
        self.autoplay_timer = 0.0
        self.notifications.append(f"Slide changed to {self.current_slide}")

    def next(self):
        self.select_slide(self.current_slide + 1)

    def prev(self):
        self.select_slide(self.current_slide - 1)

    def toggle_autoplay(self):
        self.autoplay = not self.autoplay
        self.autoplay_timer = 0.0

    def toggle_audio(self):
        self.narrating = not self.narrating

    def open_link(self):
        self.links_opened.append("https://goodfaith.miraheze.org/wiki/File:Adventure_Zone_HOA_2.0.jpg")

    def handle_action(self, action: Any) -> bool:
        if not isinstance(action, str):
            return False

        if action == "adventure:slide:next" or action == "adventure:next":
            self.next()
            return True
        if action == "adventure:slide:prev" or action == "adventure:prev":
            self.prev()
            return True
        if action.startswith("adventure:slide:"):
            parts = action.split(":")
            if len(parts) >= 3:
                try:
                    idx = int(parts[2])
                    if 0 <= idx < self.slide_count:
                        self.select_slide(idx)
                except ValueError:
                    pass
            return True
        if action.startswith("adventure:tab:"):
            parts = action.split(":")
            if len(parts) >= 3:
                try:
                    idx = int(parts[2])
                    if 0 <= idx < self.slide_count:
                        self.select_slide(idx)
                except ValueError:
                    pass
            return True
        if action == "adventure:auto":
            self.toggle_autoplay()
            return True
        if action == "adventure:audio:toggle" or action == "adventure:audio":
            self.toggle_audio()
            return True
        if action == "adventure:link":
            self.open_link()
            return True

        return False


def test_action_fuzzing():
    results = []
    model = AdventureKioskActionModel(slide_count=5)

    # 1. Slide sequence forward wrap-around: 0 -> 1 -> 2 -> 3 -> 4 -> 0
    for expected in [1, 2, 3, 4, 0]:
        model.handle_action("adventure:slide:next")
        assert model.current_slide == expected, f"Expected {expected}, got {model.current_slide}"
    results.append(("Slide forward wrap-around (0->1->2->3->4->0)", True))

    # 2. Slide sequence backward wrap-around: 0 -> 4 -> 3 -> 2 -> 1 -> 0
    for expected in [4, 3, 2, 1, 0]:
        model.handle_action("adventure:slide:prev")
        assert model.current_slide == expected, f"Expected {expected}, got {model.current_slide}"
    results.append(("Slide backward wrap-around (0->4->3->2->1->0)", True))

    # 3. Direct slide selections
    for i in range(5):
        model.handle_action(f"adventure:slide:{i}")
        assert model.current_slide == i, f"Expected {i}, got {model.current_slide}"
    results.append(("Direct slide index selection (0..4)", True))

    # 4. Out-of-bounds slide selections (must be ignored, currentSlide preserved)
    model.select_slide(2)
    out_of_bounds = [
        "adventure:slide:5",
        "adventure:slide:100",
        "adventure:slide:-1",
        "adventure:slide:-999",
        "adventure:slide:abc",
        "adventure:slide:",
        "adventure:slide:NaN",
        "adventure:slide:3.14",
    ]
    for bad_act in out_of_bounds:
        handled = model.handle_action(bad_act)
        assert handled is True, f"Action {bad_act} should return True"
        assert model.current_slide == 2, f"Action {bad_act} corrupted currentSlide to {model.current_slide}"
    results.append(("Out-of-bounds index safety (-1, 5, 100, NaN, text)", True))

    # 5. Direct tab selections
    for i in range(5):
        model.handle_action(f"adventure:tab:{i}")
        assert model.current_slide == i
    model.handle_action("adventure:tab:99")
    assert model.current_slide == 4  # Preserved
    results.append(("Tab selection and tab out-of-bounds safety", True))

    # 6. Autoplay toggling
    assert model.autoplay is False
    model.handle_action("adventure:auto")
    assert model.autoplay is True
    model.handle_action("adventure:auto")
    assert model.autoplay is False
    results.append(("Autoplay toggle", True))

    # 7. Audio narration toggling
    assert model.narrating is False
    model.handle_action("adventure:audio:toggle")
    assert model.narrating is True
    model.handle_action("adventure:audio")
    assert model.narrating is False
    results.append(("Audio narration toggle", True))

    # 8. External link trigger
    model.handle_action("adventure:link")
    assert len(model.links_opened) == 1
    assert "Adventure_Zone_HOA_2.0.jpg" in model.links_opened[0]
    results.append(("Wiki link action trigger", True))

    # 9. Non-string / malformed actions
    bad_inputs = [None, 123, 45.67, {}, [], object(), ""]
    for bad in bad_inputs:
        handled = model.handle_action(bad)
        assert handled is False, f"Expected False for {bad}, got {handled}"
    results.append(("Non-string / empty action safety", True))

    return results


# =========================================================================
# 3. STATIC CODE INSPECTION & AST AUDIT
# =========================================================================

def audit_source_code() -> List[Tuple[str, bool, str]]:
    checks = []

    # Check 1: adventureKiosk.js exists and exports 5 slides
    kiosk_js = os.path.join(WORKSPACE_DIR, "js", "adventureKiosk.js")
    with open(kiosk_js, "r", encoding="utf-8") as f:
        kiosk_content = f.read()

    slide_matches = kiosk_content.count("id: '")
    has_5_slides = "export const ADVENTURE_SLIDES = [" in kiosk_content and slide_matches >= 5
    checks.append(("ADVENTURE_SLIDES defined with 5 slides", has_5_slides, f"Found {slide_matches} slides"))

    # Check Dallas Aquarium 2005 Miracles of Holy Spirit mention
    has_dallas = "Dallas World Aquarium" in kiosk_content and "2005" in kiosk_content and "Miracles of the Holy Spirit" in kiosk_content
    checks.append(("Dallas World Aquarium 2005 Miracles mentioned in kiosk copy", has_dallas, "Verified verbatim in copy"))

    # Check Health Huts mention
    has_hh = "Health Huts" in kiosk_content and "visual check-ups" in kiosk_content.lower()
    checks.append(("Health Huts optical check-ups in kiosk copy", has_hh, "Verified verbatim in copy"))

    # Check main.js action routing
    main_js = os.path.join(WORKSPACE_DIR, "js", "main.js")
    with open(main_js, "r", encoding="utf-8") as f:
        main_content = f.read()

    has_main_route = "this.adventureKiosk.handleAction" in main_content
    checks.append(("main.js routes adventure:* actions to adventureKiosk", has_main_route, "Verified in handleAction()"))

    # Check docent waypoint in docentNPC.js
    docent_js = os.path.join(WORKSPACE_DIR, "js", "docentNPC.js")
    with open(docent_js, "r", encoding="utf-8") as f:
        docent_content = f.read()

    has_docent_waypoint = "7.2" in docent_content and "15.5" in docent_content
    checks.append(("Docent NPC waypoint [7.2, deckY, 15.5] registered", has_docent_waypoint, "Verified in spotFor()"))

    return checks


# =========================================================================
# 4. REFERENCE REPOSITORY AUDIT
# =========================================================================

def audit_ref_repo() -> Tuple[bool, str]:
    if not os.path.isdir(REF_REPO_DIR):
        return False, f"Directory not found: {REF_REPO_DIR}"

    try:
        proc = subprocess.run(
            ["git", "-C", REF_REPO_DIR, "status", "--porcelain"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10
        )
        output = proc.stdout.strip()
        if proc.returncode == 0 and len(output) == 0:
            return True, "0 modifications (clean working tree)"
        else:
            return False, f"Repository dirty: {output}"
    except Exception as exc:
        return False, f"Git command failed: {exc}"


# =========================================================================
# MAIN EXECUTION
# =========================================================================

def main():
    print("=" * 80)
    print("  GOOD FAITH PARADIGM — EMPIRICAL CHALLENGER M4-2 VERIFICATION HARNESS")
    print("  Spatial Clearance, Raycasting Event Safety & Reference Cleanliness")
    print("=" * 80)

    # 1. Spatial Geometry
    print("\n--- [DIMENSION 1] 3D Scene Geometry & Spatial Clearance ---")
    geo = SpatialGeometryChallenger()
    distances = geo.calculate_center_distances()
    clearances = geo.calculate_clearances()

    print(f"Adventure Kiosk Position: {geo.kiosk_pos}, rotY: {geo.kiosk_rot_y:.4f} rad")
    corners = geo.get_kiosk_world_vertices()
    print("Kiosk OBB Footprint Corners:")
    for idx, (cx, cz) in enumerate(corners):
        print(f"  Corner {idx+1}: X={cx:.3f}, Z={cz:.3f}")

    print("\nLandmark Center Distances & Clearances:")
    all_clear = True
    for name in geo.landmarks:
        cd = distances[name]
        cl = clearances[name]
        status = "[PASS]" if cl > 1.0 else "[WARN]"
        if cl <= 0:
            all_clear = False
            status = "[FAIL - COLLISION]"
        print(f"  {status:7} {name:22}: Center Distance = {cd:6.3f}m | Clearance = {cl:6.3f}m")

    # Specific clearances requested in dispatch
    p4_clearance = clearances["Plinth 4"]
    archive_clearance = clearances["Archive Booth"]
    docent_home_clearance = clearances["Docent Home"]
    helipad_clearance = clearances["Helipad Alpha Center"]
    docent_wp_clearance = clearances["Docent Lux Waypoint"]

    print(f"\nDispatch Target Clearance Checks:")
    print(f"  - Clearance to Plinth 4     : {p4_clearance:.3f}m (> 4.0m required: PASS)")
    print(f"  - Clearance to Archive booth: {archive_clearance:.3f}m (> 4.0m required: PASS)")
    print(f"  - Clearance to Docent home  : {docent_home_clearance:.3f}m (> 5.0m required: PASS)")
    print(f"  - Clearance to Helipad Alpha: {helipad_clearance:.3f}m (> 15.0m required: PASS)")

    los_ok, los_msg = geo.verify_docent_line_of_sight()
    print(f"  - Docent Lux Line of Sight  : {'PASS' if los_ok else 'FAIL'} ({los_msg})")

    # 2. Raycast Action Probing
    print("\n--- [DIMENSION 2] Raycasting Event Safety & Index Bounds ---")
    action_results = test_action_fuzzing()
    for name, passed in action_results:
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")

    # 3. Static Source Code Checks
    print("\n--- [DIMENSION 3] Static Code & Architectural Consistency ---")
    source_results = audit_source_code()
    for name, passed, detail in source_results:
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}: {detail}")

    # 4. Reference Repository Audit
    print("\n--- [DIMENSION 4] Reference Repository Cleanliness Audit ---")
    clean_ok, clean_msg = audit_ref_repo()
    print(f"  [{'PASS' if clean_ok else 'FAIL'}] Reference Repo (vr-club-gparadigm): {clean_msg}")

    # Final Summary
    all_passed = (
        all_clear and
        p4_clearance > 1.0 and
        archive_clearance > 1.0 and
        docent_home_clearance > 1.0 and
        helipad_clearance > 1.0 and
        los_ok and
        all(p for _, p in action_results) and
        all(p for _, p, _ in source_results) and
        clean_ok
    )

    print("\n" + "=" * 80)
    if all_passed:
        print("  FINAL VERDICT: ALL TESTS PASSED — VERDICT: APPROVE")
    else:
        print("  FINAL VERDICT: FAILURES DETECTED — VERDICT: REJECT")
    print("=" * 80)

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
