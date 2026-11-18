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


def arch_trim(name, cx, front, bottom, width, height, color, category="trim"):
    """Decorative arch edge built as real thin 3D beams above a rectangular opening."""
    radius=max(.20,width*.5)
    rise=min(radius,max(.18,height*.36))
    steps=12
    previous=None
    for j in range(steps+1):
        t=math.pi*(1-j/steps)
        x=cx+radius*math.cos(t)
        z=bottom+height-rise+rise*math.sin(t)
        pt=(x,front,z)
        if previous is not None:
            beam("%s_arc_%02d"%(name,j),category,previous,pt,.070,color)
        previous=pt


def shutters(name, cx, front, bottom, width, height):
    """Two raised shutter assemblies. Meshes stay in their own semantic collection."""
    strip=max(.15,min(.36,width*.19))
    for side in (-1,1):
        x=cx+side*(width/2+strip*.55+.08)
        box("%s_shutter_%s"%(name,"L" if side<0 else "R"),
            "shutter",(x,front,bottom+height/2),(strip,.10,height*.92),"#30363a")
        for i in range(1,5):
            z=bottom+height*.1+i*height*.15
            box("%s_shutter_slat_%s_%d"%(name,side,i),"shutter",
                (x,front-.07,z),(strip*.82,.025,.018),"#454b4b")


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
        # Keep a low back roof mass when Gemini detected multiple visible gables.
        # Otherwise the generic full-width triangle hides the actual two-gable silhouette.
        if plan.get("front_gables"):
            gable("REAR_ROOF_ESTIMATED", -W / 2, W / 2, H,
                  H + .85, FRONT + 1.2, -FRONT, wall, roof, trim, True)
        else:
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

    # Two-step farmhouse roofline:
    # dominant front gable is higher and farther back; smaller garage gable
    # projects forward. This ordering preserves visible intersections.
    front_gables = plan.get("front_gables", [])[:4]
    ordered = sorted(enumerate(front_gables),
                     key=lambda pair: float(pair[1]["width"]), reverse=True)
    dominant_idx = ordered[0][0] if ordered else -1
    dominant_span = None
    for i, g in ordered:
        cx = (float(g["center_x"]) - .5) * W
        gw = max(1.5, min(11.5, float(g["width"]) * W))
        is_dominant = i == dominant_idx
        ratio = max(.12, min(.8, float(g["height_ratio"])))
        gr = H + max(1.30 if is_dominant else .80,
                     min(3.45 if is_dominant else 2.15, ratio * H))
        nose = FRONT - (.22 if is_dominant else 1.12)
        tail = -FRONT if is_dominant else FRONT + 1.55
        gable("PRIMARY_%02d" % i if is_dominant else "SECONDARY_%02d" % i,
              cx - gw / 2, cx + gw / 2,
              H + .06, gr, nose, tail, wall, roof, trim, True)
        if is_dominant:
            dominant_span = (cx - gw / 2, cx + gw / 2, nose, gr)

    # Main roof upper gable window (if identified): position against the gable
    # front face rather than clamping it to a ground-floor rectangular wall.

    # Predicted normalized front facade boxes: image-derived estimates only.
    for i, opening in enumerate(plan.get("openings", [])[:18]):
        kind = opening["kind"]
        x = (float(opening["x"]) + float(opening["width"]) / 2 - .5) * W
        w = max(.45, min(W * .6, float(opening["width"]) * W))
        h = max(.50, min(H * .82, float(opening["height"]) * H))
        normalized_center_y = float(opening["y"]) + float(opening["height"]) / 2
        is_gable_window = (
            kind == "window" and dominant_span is not None
            and normalized_center_y > .63 and w < 1.5
            and dominant_span[0] < x < dominant_span[1]
        )
        if is_gable_window:
            z = H + min(1.18, (dominant_span[3] - H) * .45)
            h = min(h, .69)
            w = min(w, .70)
            front = dominant_span[2] - .23
        else:
            z = max(h / 2 + .04, min(H - h / 2 - .06,
                normalized_center_y * H))
            front = FRONT - .22
        shape = opening.get("shape", "rectangular")
        has_shutters = bool(opening.get("shutters", False))
        if kind == "garage_door":
            box("GARAGE__frame_%02d" % i, "trim", (x, front, z), (w + .27, .12, h + .22), trim)
            box("GARAGE__door_%02d" % i, "garage", (x, front - .10, z), (w, .11, h), garage)
            cols = max(2, min(5, round(w / .8)))
            for r in range(1, 4):
                box("GARAGE__row_%02d_%d" % (i, r), "garage",
                    (x, front - .18, z - h / 2 + r * h / 4), (w, .04, .025), "#bec4c2", False, True)
            if shape == "arched":
                arch_trim("GARAGE__arch_%02d"%i,x,front-.19,z-h/2,w,h,trim)
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
            if shape == "arched":
                arch_trim("WINDOW__arch_%02d"%i,x,front-.23,z-h/2,w,h,trim)
            if has_shutters:
                shutters("WINDOW__%02d"%i,x,front-.18,z-h/2,w,h)

    # SIDE/REAR: place ONLY openings actually observed in uploaded photos.
    # All elevations remain dimensionally estimated. Coordinates are local
    # image left-to-right as viewed from outside each elevation.
    observed=set(plan.get("observed_views", []))
    for i, opening in enumerate(plan.get("side_openings", [])[:20]):
        view=opening.get("view")
        if view not in observed or view not in ("left", "right", "rear"):
            continue
        kind=opening.get("kind", "window")
        u=max(.02,min(.98,float(opening.get("x", 0)) + float(opening.get("width", .1)) / 2))
        v=max(.03,min(.97,float(opening.get("y", 0)) + float(opening.get("height", .1)) / 2))
        length=D if view in ("left","right") else W
        width=max(.33,min(length*.52,float(opening.get("width", .1))*length))
        height=max(.38,min(H*.8,float(opening.get("height", .15))*H))
        z=max(height/2+.08,min(H-height/2-.06,v*H))
        if view=="left":
            # Viewed looking toward +X, image right points toward -Y.
            origin=(-W/2-.20, (0.5-u)*D, z)
            dims=(.11,width,height)
            trimdims=(.13,width+.19,height+.18)
            glassloc=(-W/2-.30,origin[1],z)
        elif view=="right":
            origin=(W/2+.20,(u-.5)*D,z)
            dims=(.11,width,height)
            trimdims=(.13,width+.19,height+.18)
            glassloc=(W/2+.30,origin[1],z)
        else:
            # Rear photograph's left appears on building world +X.
            origin=((.5-u)*W,-FRONT+.20,z)
            dims=(width,.11,height)
            trimdims=(width+.19,.13,height+.18)
            glassloc=(origin[0],-FRONT+.30,z)
        prefix="OBSERVED_%s_%02d" % (view.upper(),i)
        box(prefix+"_casing","trim",origin,trimdims,trim,False)
        color=garage if kind=="garage_door" else entry if kind=="entry_door" else "#334d59"
        klass="garage" if kind=="garage_door" else "door" if kind=="entry_door" else "window"
        box(prefix+"_infill",klass,glassloc,dims,color,False,True)
        if kind=="window":
            if view in ("left","right"):
                box(prefix+"_mullion","trim",(glassloc[0]*1.002,glassloc[1],z),
                    (.06,.045,height),trim,False)
            else:
                box(prefix+"_mullion","trim",(glassloc[0],glassloc[1]*1.002,z),
                    (.045,.06,height),trim,False)

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
        # A light porch header, rather than a chunky floating flat roof.
        box("PORCH__header", "trim", (middle, depth, pz),
            (width, .18, .13), trim)
        box("PORCH__soffit", "trim", (middle, FRONT - .93, pz + .10),
            (width + .14, 1.17, .08), trim, True)

    box("SITE__lawn", "landscape", (0, 0, -.16), (22, 20, .22), "#73845a", True)
    box("SITE__driveway", "driveway",
        (-W * .26 if plan.get("garage_side") == "left" else W * .26, FRONT - 6, -.025),
        (3.6, 10.6, .045), "#b8b9b4", True)

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
