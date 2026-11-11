"""The avatar file: a neutral grey mannequin as GLB, no textures, no skeleton.

Built at MHR's LOD 3 (4,899 vertices) to stay under the size budget; measurements always come
from LOD 1. Units are metres (glTF's convention), Y up, facing +Z.
"""

import trimesh

MAX_GLB_BYTES = 600 * 1024
# The app's tint-steel token (#a5b8c0): flat, catalogue-mannequin grey.
GREY = [165, 184, 192, 255]


def glb_bytes(vertices_cm, faces) -> bytes:
    mesh = trimesh.Trimesh(vertices=vertices_cm / 100.0, faces=faces, process=False)
    mesh.visual = trimesh.visual.TextureVisuals(
        material=trimesh.visual.material.PBRMaterial(baseColorFactor=GREY, metallicFactor=0.0, roughnessFactor=0.9)
    )
    data = trimesh.exchange.gltf.export_glb(trimesh.Scene(mesh), include_normals=True)
    if len(data) > MAX_GLB_BYTES:
        raise ValueError(f"avatar is {len(data)} bytes, over the {MAX_GLB_BYTES} budget")
    return data


def mannequin_glb(coeffs, scales, height_cm: float | None = None) -> bytes:
    """The stored avatar for a body shape: LOD 3, scaled to the stated height when given. Needs the `body` extra."""
    from .model import load

    model = load(3)
    body = model.geometry(coeffs, scales)
    vertices = body.vertices
    if height_cm:
        floor = vertices[:, 1].min()
        stature = vertices[:, 1].max() - floor
        vertices = vertices.copy()
        vertices[:, 1] -= floor
        vertices *= height_cm / stature
    return glb_bytes(vertices, body.faces)
