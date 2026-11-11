"""Renders frames of one Blender scene to PNG files, for Hoca's renderer to put into the video.

    blender -b --factory-startup -P engines/blender/render.py -- job.json

job: {module, ctx, frames: [local frame numbers], outDir, scale, samples, engine}
The scene module defines build(ctx, hoca) to create its objects and keyframes, and may define
update(ctx, hoca, seconds) to change things per frame. Prints FRAME_DONE once per frame;
writes <outDir>/<frame>.png.
"""

import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

# Importing the scene must not leave __pycache__ in the user's project.
sys.dont_write_bytecode = True

job = json.loads(Path(sys.argv[sys.argv.index("--") + 1]).read_text(encoding="utf-8"))
ctx = job["ctx"]
fps = ctx["fps"]


def srgb(hex_color):
    """'#58C4DD' -> linear RGBA, the space Blender's colors are in."""
    value = hex_color.lstrip("#")
    channels = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels) + (1.0,)


def smooth(t):
    t = min(1.0, max(0.0, t))
    s = 1 - t
    return t ** 3 * (10 * s * s + 5 * s * t + t * t)


class Hoca:
    """Helpers handed to build() and update(): timing from the narration, and a few scene shortcuts."""

    C = {"bg": "#000000", "text": "#FFFFFF", "muted": "#BBBBBB", "blue": "#58C4DD", "teal": "#5CD0B3", "green": "#83C167",
         "yellow": "#FFFF00", "gold": "#F0AC5F", "orange": "#FF862F", "red": "#FC6255", "pink": "#DC75CD", "purple": "#B189C6"}

    def __init__(self, ctx):
        self.ctx = ctx
        self.fps = ctx["fps"]

    # --- timing ---------------------------------------------------------------------------------
    def frame(self, seconds):
        """Blender frame number at `seconds` into the scene (frame 0 is the scene's first)."""
        return round(seconds * self.fps)

    def beat(self, i, delay=0.0):
        """Seconds at which sentence i begins, plus `delay`."""
        beats = self.ctx["beats"]
        return (beats[min(max(0, i), len(beats) - 1)]["start"] if beats else 0.0) + delay

    def on_beat(self, seconds, i, delay=0.0, length=1.0):
        """0 -> 1 over `length` seconds from sentence i (+delay), with manim's smooth easing."""
        return smooth((seconds - self.beat(i, delay)) / length)

    def key(self, obj, path, value, seconds):
        """Keyframe obj.<path> = value at `seconds`: hoca.key(cube, 'location', (0, 0, 1), hoca.beat(1)).
        A dotted path reaches into the object: hoca.key(lamp, 'data.energy', 500, 2.0)."""
        *parents, attr = path.split(".")
        target = obj
        for part in parents:
            target = getattr(target, part)
        setattr(target, attr, value)
        target.keyframe_insert(data_path=attr, frame=self.frame(seconds))

    # --- building -------------------------------------------------------------------------------
    def material(self, color="#58C4DD", emission=0.0, roughness=0.5, metallic=0.0):
        mat = bpy.data.materials.new(name=f"hoca-{color}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        rgba = srgb(color) if isinstance(color, str) else color
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if emission:
            bsdf.inputs["Emission Color"].default_value = rgba
            bsdf.inputs["Emission Strength"].default_value = emission
        return mat

    def paint(self, obj, color="#58C4DD", **options):
        obj.data.materials.clear()
        obj.data.materials.append(self.material(color, **options))
        return obj

    def text(self, body, location=(0, 0, 0), size=0.5, color="#FFFFFF", extrude=0.0, align="CENTER", emission=1.0, rotation=(math.radians(90), 0, 0)):
        """Text standing upright and facing -Y, toward the default camera."""
        bpy.ops.object.text_add(location=location, rotation=rotation)
        obj = bpy.context.object
        obj.data.body = body
        obj.data.size = size
        obj.data.extrude = extrude
        obj.data.align_x = align
        obj.data.align_y = "CENTER"
        return self.paint(obj, color, emission=emission)

    def camera(self, location=(0, -8, 3), look_at=(0, 0, 0), lens=50):
        bpy.ops.object.camera_add(location=location)
        cam = bpy.context.object
        cam.data.lens = lens
        self.look_at(cam, look_at)
        bpy.context.scene.camera = cam
        return cam

    def look_at(self, obj, target):
        direction = Vector(target) - obj.location
        obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

    def sun(self, strength=3.0, angle=(math.radians(50), 0, math.radians(30))):
        bpy.ops.object.light_add(type="SUN", rotation=angle)
        bpy.context.object.data.energy = strength
        return bpy.context.object

    def image_plane(self, name, location=(0, 0, 0), height=2.0):
        """One of the user's images on a flat, unlit plane, `height` units tall."""
        info = self.ctx["inputs"][name]
        image = bpy.data.images.load(info["path"])
        width = height * info["width"] / info["height"]
        bpy.ops.mesh.primitive_plane_add(size=1, location=location)
        plane = bpy.context.object
        plane.scale = (width, height, 1)
        plane.rotation_euler = (math.radians(90), 0, 0)
        mat = bpy.data.materials.new(name=f"image-{name}")
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        nodes.clear()
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        emit = nodes.new("ShaderNodeEmission")
        out = nodes.new("ShaderNodeOutputMaterial")
        links.new(tex.outputs["Color"], emit.inputs["Color"])
        links.new(emit.outputs["Emission"], out.inputs["Surface"])
        plane.data.materials.append(mat)
        return plane


def setup_scene():
    scene = bpy.context.scene
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scale = job.get("scale", 1)
    scene.render.resolution_x = round(ctx["width"] * scale)
    scene.render.resolution_y = round(ctx["height"] * scale)
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    scene.frame_start = 0
    scene.frame_end = max(0, ctx["durationInFrames"] - 1)
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    # The exact palette colors, not a filmic look, so 3D scenes match the SVG ones beside them.
    scene.view_settings.view_transform = "Standard"
    engine = job.get("engine", "cycles").lower()
    if engine == "cycles":
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = int(job.get("samples", 16))
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = "OPENIMAGEDENOISE"
        scene.cycles.denoising_prefilter = "FAST"
        # Explainer scenes are a few solids and one light: short light paths look the same and render much faster.
        scene.cycles.max_bounces = 4
        scene.cycles.diffuse_bounces = 2
        scene.cycles.glossy_bounces = 2
        scene.cycles.transmission_bounces = 4
        scene.cycles.volume_bounces = 0
        scene.cycles.caustics_reflective = False
        scene.cycles.caustics_refractive = False
        # Keep the scene's data between frames instead of rebuilding it for each one.
        scene.render.use_persistent_data = True
    elif engine == "workbench":
        scene.render.engine = "BLENDER_WORKBENCH"
    else:
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in {e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items} else "BLENDER_EEVEE"
    world = bpy.data.worlds.new("hoca") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = srgb("#000000")
    background.inputs["Strength"].default_value = 1.0
    return scene


def main():
    spec = importlib.util.spec_from_file_location("hoca_scene", job["module"])
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(Path(job["module"]).parent))
    spec.loader.exec_module(module)
    if not hasattr(module, "build"):
        raise SystemExit(f"{Path(job['module']).name} must define build(ctx, hoca)")

    scene = setup_scene()
    hoca = Hoca(ctx)
    module.build(ctx, hoca)
    if scene.camera is None:
        hoca.camera()
    update = getattr(module, "update", None)
    out = Path(job["outDir"])
    out.mkdir(parents=True, exist_ok=True)
    frames = sorted(set(job["frames"]))
    if not update and frames and frames == list(range(frames[0], frames[-1] + 1)):
        # A contiguous run of frames renders as one animation: Blender then skips its per-frame setup.
        scene.frame_start, scene.frame_end = frames[0], frames[-1]
        scene.render.filepath = str(out / "#")
        bpy.app.handlers.render_write.append(lambda *_: print("FRAME_DONE", flush=True))
        bpy.ops.render.render(animation=True)
        return
    for frame in frames:
        scene.frame_set(frame)
        if update:
            update(ctx, hoca, frame / fps)
        scene.render.filepath = str(out / f"{frame}.png")
        bpy.ops.render.render(write_still=True)
        print("FRAME_DONE", flush=True)


try:
    main()
except Exception as error:  # noqa: BLE001 - reported to Hoca, which shows it to the agent
    import traceback
    print(traceback.format_exc(), flush=True)
    print(f"HOCA_ERROR {type(error).__name__}: {error}", flush=True)
    sys.exit(1)
