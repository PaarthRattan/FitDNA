"""Mesh geometry for tape-style measurements. Pure numpy, no body model, so it's tested in CI.

A tape measure bridges hollows, so girths are the perimeter of the convex hull of a cross-section,
and the across-the-back shoulder measurement is the hull path over the back between two points.
"""

import numpy as np

ON_PLANE = 1e-9


def plane_section_points(vertices: np.ndarray, faces: np.ndarray, origin: np.ndarray, normal: np.ndarray) -> np.ndarray:
    """Points where the plane meets the mesh (unordered, may repeat). (N, 3).

    Edges that cross the plane contribute their crossing point, and vertices lying on the plane
    contribute themselves: a plane through a whole ring of vertices crosses no edge strictly.
    """
    normal = normal / np.linalg.norm(normal)
    d = (vertices - origin) @ normal
    d = np.where(np.abs(d) < ON_PLANE, 0.0, d)
    used = np.unique(faces)
    on_plane = vertices[used[d[used] == 0.0]]
    fd = d[faces]
    crossing = (fd.min(axis=1) < 0) & (fd.max(axis=1) > 0)
    if not crossing.any():
        return on_plane
    tri = faces[crossing]
    edges = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    da, db = d[edges[:, 0]], d[edges[:, 1]]
    cut = da * db < 0
    a, b = edges[cut, 0], edges[cut, 1]
    t = (da[cut] / (da[cut] - db[cut]))[:, None]
    return np.vstack([vertices[a] + (vertices[b] - vertices[a]) * t, on_plane])


def convex_hull_2d(points: np.ndarray) -> np.ndarray:
    """Hull vertices in counter-clockwise order (Andrew's monotone chain)."""
    pts = np.unique(np.round(points, 6), axis=0)
    if len(pts) < 3:
        return pts
    pts = pts[np.lexsort((pts[:, 1], pts[:, 0]))]

    def cross(o: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
        return float((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]))

    lower: list[np.ndarray] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[np.ndarray] = []
    for p in pts[::-1]:
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return np.array(lower[:-1] + upper[:-1])


def hull_perimeter(points2d: np.ndarray) -> float:
    hull = convex_hull_2d(points2d)
    if len(hull) < 3:
        return 0.0
    return float(np.linalg.norm(hull - np.roll(hull, -1, axis=0), axis=1).sum())


def faces_within(faces: np.ndarray, keep: np.ndarray) -> np.ndarray:
    """Faces whose three vertices are all in the boolean vertex mask."""
    return faces[keep[faces].all(axis=1)]


def horizontal_girth(vertices: np.ndarray, faces: np.ndarray, y: float) -> float:
    """Tape-style girth of the horizontal cross-section at height y (Y is up). 0 if the plane misses."""
    points = plane_section_points(vertices, faces, np.array([0.0, y, 0.0]), np.array([0.0, 1.0, 0.0]))
    if len(points) < 3:
        return 0.0
    return hull_perimeter(points[:, [0, 2]])


def girth_profile(vertices: np.ndarray, faces: np.ndarray, y_from: float, y_to: float, step: float = 0.5) -> np.ndarray:
    """(n, 2) array of [y, girth] from y_from towards y_to."""
    n = max(2, int(abs(y_to - y_from) / step) + 1)
    ys = np.linspace(y_from, y_to, n)
    return np.array([[y, horizontal_girth(vertices, faces, y)] for y in ys])


def arc_between(vertices: np.ndarray, faces: np.ndarray, a: np.ndarray, b: np.ndarray, via: np.ndarray) -> float:
    """Tape length from a to b over the surface, in the plane through a, b and `via`, on via's side.

    The plane's cross-section is split by the chord a–b; the hull of the points on via's side plus
    a and b is the tape path plus the chord, so the path is that hull's perimeter minus the chord.
    """
    chord = b - a
    length = float(np.linalg.norm(chord))
    normal = np.cross(chord, via - a)
    if length == 0 or np.linalg.norm(normal) == 0:
        return 0.0
    points = plane_section_points(vertices, faces, a, normal)
    u = chord / length
    v = np.cross(normal / np.linalg.norm(normal), u)
    side = np.sign((via - a) @ v)
    p2 = np.column_stack([(points - a) @ u, (points - a) @ v])
    keep = (p2[:, 1] * side > 0) & (p2[:, 0] >= 0) & (p2[:, 0] <= length)
    candidates = np.vstack([[0.0, 0.0], [length, 0.0], p2[keep]])
    perimeter = hull_perimeter(candidates)
    return max(0.0, perimeter - length) if perimeter > 0 else 0.0
