"use client";

import { useEffect, useRef, useState } from "react";
import { Photo } from "@/components/ui";

/**
 * Shows the avatar (a GLB from a short-lived signed link) with three.js: drag to turn it
 * around; no zoom or pan. Loaded only on this page and only in the browser. Falls back to
 * a placeholder when WebGL isn't available or the file can't be loaded.
 */
export function AvatarViewer({ url }: { url: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
      if (disposed) return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setState("failed");
        return;
      }
      const size = () => ({ w: element.clientWidth, h: element.clientHeight });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(size().w, size().h);
      element.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-hidden", "true");

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8899a0, 2.2));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(1.5, 2.5, 2.5);
      scene.add(key);

      const camera = new THREE.PerspectiveCamera(30, size().w / size().h, 0.05, 50);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.minPolarAngle = controls.maxPolarAngle = Math.PI / 2;
      const render = () => renderer.render(scene, camera);
      controls.addEventListener("change", render);

      const onResize = () => {
        const { w, h } = size();
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        render();
      };
      window.addEventListener("resize", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        controls.dispose();
        scene.traverse((o) => {
          const mesh = o as InstanceType<typeof THREE.Mesh>;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((m) => m.dispose());
          }
        });
        renderer.dispose();
        renderer.domElement.remove();
      };

      try {
        const gltf = await new GLTFLoader().loadAsync(url);
        if (disposed) return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const centre = box.getCenter(new THREE.Vector3());
        const height = box.getSize(new THREE.Vector3()).y;
        model.position.sub(centre);
        scene.add(model);
        const distance = height / 2 / Math.tan((camera.fov * Math.PI) / 360) + height * 0.25;
        camera.position.set(0, 0, distance);
        controls.target.set(0, 0, 0);
        controls.update();
        render();
        setState("ready");
      } catch {
        if (!disposed) setState("failed");
      }
    })().catch(() => {
      if (!disposed) setState("failed");
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [url]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={host}
        className={`relative w-full h-[420px] border border-ink bg-tint-steel shadow-hard-lg touch-none ${state === "failed" ? "hidden" : ""}`}
        role="img"
        aria-label="Your avatar: a grey 3D figure of your body shape, with a generic head"
      >
        {state === "loading" && <p className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-[#333]">Loading…</p>}
      </div>
      {state === "failed" && (
        <Photo
          label="Your avatar couldn't be shown here: this browser may not support 3D, or the link expired. Reload the page to try again."
          className="h-[420px]"
        />
      )}
      {state === "ready" && <p className="text-xs text-[#333]">Drag to turn it around.</p>}
    </div>
  );
}
