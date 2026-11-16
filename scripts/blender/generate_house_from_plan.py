"""Blender 4.0+/5.x: Gemini architectural plan -> real editable mesh objects.

Usage:
blender --background --python scripts/blender/generate_house_from_plan.py -- \
  --plan /tmp/house_plan.json --out /tmp/house.glb

This builds an *estimated* model, NOT photogrammetry. Side/rear geometry is provisional.
Each component is a named mesh with semantic_class, component_id, estimated,
and a Blender collection. glTF export_extras preserves these object properties.
"""
import bpy
import json
import math
import argparse
import sys
import os
from mathutils import Vector

W, D, FRONT = 12.0, 8.8, -4.4
COLLECTIONS = {}
MATERIALS = {}


def args():
    p = argparse.ArgumentParser()
    p.add_argument("--plan", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--blend", default="")
    return p.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def collection(label):
    if label not in COLLECTIONS:
        c = bpy.data.collections.new("CLASS - " + label.upper())
        bpy.context.scene.collection.children.link(c)
        COLLECTIONS[label] = c
    return COLLECTIONS[label]


def mat(color):
    if not isinstance(color, str) or len(color) != 7 or not color.startswith("#"):
        color = "#cccccc"
    key = color.lower()
    if key not in MATERIALS:
        m = bpy.data.materials.new("MAT_" + key)
        rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        m.diffuse_color = (*[pow((c + .055) / 1.055, 2.4) if c > .04045 else c / 12.92 for c in rgb], 1)
        m.use_nodes = True
        shader = m.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = m.diffuse_color
            shader.inputs["Roughness"].default_value = .82
        MATERIALS[key] = m
    return MATERIALS[key]


def semantic(obj, klass, estimated=False, locked=False):
    obj["semantic_class"] = klass
    obj["component_id"] = obj.name
    obj["estimated_geometry"] = estimated
    obj["locked_material"] = locked
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection(klass).objects.link(obj)
    return obj


def box(name, klass, loc, dims, color, estimated=False, locked=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat(color))
    return semantic(obj, klass, estimated, locked)


def poly(name, klass, vertices, color, estimated=False):
    mesh = bpy.data.meshes.new(name + "_mesh")
    mesh.from_pydata(vertices, [], [tuple(range(len(vertices)))])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection(klass).objects.link(obj)
    mesh.materials.append(mat(color))
    obj["semantic_class"] = klass
    obj["component_id"] = name
    obj["estimated_geometry"] = estimated
    obj["locked_material"] = False
    return obj


def beam(name, klass, a, b, thickness, color, estimated=False):
    a, b = Vector(a), Vector(b)
    midpoint = (a + b) * .5
    obj = box(name, klass, midpoint, (thickness, thickness, (b - a).length), color, estimated)
    obj.rotation_euler = (b - a).to_track_quat("Z", "Y").to_euler()
    return obj


def gable(prefix, x0, x1, y0, yr, nose, tail, wall, roof, trim, estimated=False):
    center = (x0 + x1) / 2
    poly(prefix + "_gable_siding", "siding",
         [(x0, nose, y0), (x1, nose, y0), (center, nose, yr)], wall, estimated)
    poly(prefix + "_left_roof", "roof",
         [(x0 - .18, nose - .18, y0 + .02), (center, nose - .18, yr + .08),
          (center, tail, yr + .08), (x0 - .18, tail, y0 + .02)], roof, estimated)
    poly(prefix + "_right_roof", "roof",
         [(center, nose - .18, yr + .08), (x1 + .18, nose - .18, y0 + .02),
          (x1 + .18, tail, y0 + .02), (center, tail, yr + .08)], roof, estimated)
    beam(prefix + "_left_rake", "trim", (x0 - .18, nose - .19, y0),
         (center, nose - .19, yr + .08), .12, trim, estimated)
    beam(prefix + "_right_rake", "trim", (center, nose - .19, yr + .08),
         (x1 + .18, nose - .19, y0), .12, trim, estimated)
    # Vertical board-and-batten lines within triangular gable.
    for i in range(1, max(2, int((x1 - x0) / .45))):
        x = x0 + (x1 - x0) * i / max(2, int((x1 - x0) / .45))
        t = 1 - abs(x - center) / max(.01, (x1 - x0) / 2)
        top = y0 + (yr - y0) * t
        if top > y0 + .12:
            beam(prefix + "_gable_batten_" + str(i), "siding",
                 (x, nose - .03, y0 + .025), (x, nose - .03, top - .1),
                 .028, wall, estimated)


def generate(plan):
    H = 6.4 if int(plan["stories"]) == 2 else 4.0
    wall = plan.get("siding_color", "#ebe9e3")
    roof = plan.get("roof_color", "#4c5358")
    # Do not make white roofing the same color as siding, which obscures form.
    if roof.lower() in ("#ffffff", "#fefefe", "#fafafa"):
        roof = "#4c5358"
    trim = "#eeeae1"
    garage = "#f0f0eb"
    entry = "#6c5140"

    box("FRONT__wall_observed", "siding", (0, FRONT, H / 2), (W, .24, H), wall)
    box("REAR__wall_estimated", "siding", (0, -FRONT, H / 2), (W, .24, H), wall, True)
    box("SIDE__left_estimated", "siding", (-W / 2, 0, H / 2), (.24, D, H), wall, True)
    box("SIDE__right_estimated", "siding", (W / 2, 0, H / 2), (.24, D, H), wall, True)
    box("FOUNDATION__front", "trim", (0, FRONT - .17, .10), (W + .2, .20, .2), trim)
    if plan.get("siding_style") == "board_and_batten":
        for i in range(27):
            x = -W / 2 + i * W / 26
            box("SIDING__batten_%02d" % i, "siding", (x, FRONT - .15, H / 2),
                (.045, .04, H), wall)

    eave = H + .1
    rise = {"low": 1.3, "medium": 2.1, "steep": 3.0}.get(plan.get("roof_pitch"), 2.1)
    ridge = eave + rise
    over = .55

    if plan.get("roof_type") == "flat":
        box("ROOF__flat_estimated", "roof", (0, 0, eave), (W + 1.1, D + 1.1, .20), roof, True)
    elif plan.get("roof_ridge_direction") == "front_to_back":
        gable("MAIN", -W / 2, W / 2, H, ridge, FRONT, -FRONT, wall, roof, trim)
    else:
        poly("ROOF__front_slope", "roof", [
            (-W / 2 - over, FRONT - over, eave),
            (W / 2 + over, FRONT - over, eave),
            (W / 2 + over, 0, ridge),
            (-W / 2 - over, 0, ridge)], roof)
        poly("ROOF__back_slope", "roof", [
            (-W / 2 - over, 0, ridge),
            (W / 2 + over, 0, ridge),
            (W / 2 + over, -FRONT + over, eave),
            (-W / 2 - over, -FRONT + over, eave)], roof, True)

    # Nested front-facing gables. Always modeled from explicit Gemini plan.
    for i, g in enumerate(plan.get("front_gables", [])[:4]):
        cx = (float(g["center_x"]) - .5) * W
        gw = max(1.5, min(11.5, float(g["width"]) * W))
        gr = H + max(.6, min(3.3, float(g["height_ratio"]) * H))
        gable("CROSS_%02d" % i, cx - gw / 2, cx + gw / 2,
              H + .04, gr, FRONT - 1.05, FRONT + 1.40, wall, roof, trim, True)

    # Predicted normalized front facade boxes: image-derived estimates only.
    for i, opening in enumerate(plan.get("openings", [])[:18]):
        kind = opening["kind"]
        x = (float(opening["x"]) + float(opening["width"]) / 2 - .5) * W
        w = max(.45, min(W * .6, float(opening["width"]) * W))
        h = max(.50, min(H * .82, float(opening["height"]) * H))
        z = max(h / 2 + .04, min(H - h / 2 - .06,
            (float(opening["y"]) + float(opening["height"]) / 2) * H))
        front = FRONT - .22
        if kind == "garage_door":
            box("GARAGE__frame_%02d" % i, "trim", (x, front, z), (w + .27, .12, h + .22), trim)
            box("GARAGE__door_%02d" % i, "garage", (x, front - .10, z), (w, .11, h), garage)
            cols = max(2, min(5, round(w / .8)))
            for r in range(1, 4):
                box("GARAGE__row_%02d_%d" % (i, r), "garage",
                    (x, front - .18, z - h / 2 + r * h / 4), (w, .04, .025), "#bec4c2", False, True)
            for k in range(cols):
                bx = x - w / 2 + (k + .5) * w / cols
                box("GARAGE__lite_%02d_%d" % (i, k), "garage",
                    (bx, front - .19, z + h * .33), (w / cols * .73, .035, h * .12), "#364752", False, True)
        elif kind == "entry_door":
            box("DOOR__casing_%02d" % i, "trim", (x, front, z), (w + .18, .12, h + .14), trim)
            box("DOOR__leaf_%02d" % i, "door", (x, front - .11, z), (w, .11, h), entry, False, True)
            box("DOOR__glazing_%02d" % i, "door", (x, front - .19, z + h * .12),
                (w * .38, .035, h * .40), "#344955", False, True)
        else:
            box("WINDOW__casing_%02d" % i, "trim", (x, front, z), (w + .19, .12, h + .20), trim)
            box("WINDOW__glass_%02d" % i, "window", (x, front - .11, z), (w, .11, h), "#344b5a", False, True)
            box("WINDOW__vertical_%02d" % i, "trim", (x, front - .20, z), (.05, .06, h), trim)
            box("WINDOW__sill_%02d" % i, "trim", (x, front - .20, z - h / 2 - .08),
                (w + .27, .24, .10), trim)

    posts = plan.get("porch_posts", [])[:8]
    if posts:
        xs = [(float(x) - .5) * W for x in posts]
        pz = min(H * .79, 3.0)
        depth = FRONT - 1.35
        for i, x in enumerate(xs):
            box("PORCH__post_%02d" % i, "trim", (x, depth, pz / 2), (.18, .18, pz), trim)
            box("PORCH__base_%02d" % i, "trim", (x, depth, .14), (.29, .29, .28), trim)
        width = max(2.0, max(xs) - min(xs) + 1.15)
        middle = (max(xs) + min(xs)) / 2
        box("PORCH__header", "trim", (middle, depth, pz), (width, .22, .19), trim)
        box("PORCH__roof", "roof", (middle, FRONT - .85, pz + .16), (width + .22, 1.45, .14), roof, True)

    box("SITE__lawn", "landscape", (0, 0, -.16), (22, 20, .22), "#73845a", True)
    box("SITE__driveway", "driveway",
        (-W * .26 if plan.get("garage_side") == "left" else W * .26, FRONT - 6, -.025),
        (4.0, 11.5, .05), "#a4a7a2", True)

    # Organize and preserve semantic metadata in GLB extras.
    camera_data = bpy.data.cameras.new("Camera_front")
    camera = bpy.data.objects.new("Camera_front", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (11, -20, 12)
    direction = Vector((0, 0, 3)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = camera
    # Use the Blender version's default render engine.
    bpy.context.scene.render.resolution_x = 1400
    bpy.context.scene.render.resolution_y = 1000
    bpy.context.scene.render.resolution_percentage = 100


def main():
    opts = args()
    with open(opts.plan, "r", encoding="utf-8") as f:
        plan = json.load(f)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    generate(plan)
    os.makedirs(os.path.dirname(os.path.abspath(opts.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(opts.out),
                              export_format="GLB", export_extras=True, export_yup=True)
    if opts.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(opts.blend))
    print("EXTERIOR_STUDIO_GLTF_OK", opts.out, len(bpy.context.scene.objects))


if __name__ == "__main__":
    main()
