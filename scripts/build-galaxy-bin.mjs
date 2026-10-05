import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const THREE = require("three");
const { GLTFLoader } = require("three/examples/jsm/loaders/GLTFLoader.js");

const GALAXY_SIZE = 5.5;
const GLB = "public/models/need_some_space.glb";
const OUT = "public/models/need_some_space.bin";

new GLTFLoader()
  .parseAsync(fs.readFileSync(GLB).buffer, "")
  .then((gltf) => {
    let from;
    gltf.scene.traverse((o) => {
      if (o.isPoints && !from) from = o;
    });
    if (!from) throw new Error("no Points object found");
    const srcPos = from.geometry.getAttribute("position");
    const srcCol = from.geometry.getAttribute("color");
    const count = srcPos.count;

    const pos = new Float32Array(srcPos.array);
    const rgb = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      rgb[i * 3] = srcCol.getX(i);
      rgb[i * 3 + 1] = srcCol.getY(i);
      rgb[i * 3 + 2] = srcCol.getZ(i);
    }

    const box = new THREE.Box3();
    for (let i = 0; i < count; i++) {
      box.expandByPoint(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    }
    const maxDim = Math.max(box.getSize(new THREE.Vector3()).x, 0);
    const scale = GALAXY_SIZE / Math.max(...[box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z]);
    const center = box.getCenter(new THREE.Vector3());
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (pos[i * 3] - center.x) * scale;
      pos[i * 3 + 1] = (pos[i * 3 + 1] - center.y) * scale;
      pos[i * 3 + 2] = (pos[i * 3 + 2] - center.z) * scale;
    }

    const buf = new ArrayBuffer(4 + count * 12 * 2);
    new DataView(buf).setUint32(0, count, true);
    new Float32Array(buf, 4, count * 3).set(pos);
    new Float32Array(buf, 4 + count * 12, count * 3).set(rgb);
    fs.writeFileSync(OUT, Buffer.from(buf));
    console.log("wrote", OUT, "count:", count, "scale:", scale.toFixed(4), "bytes:", buf.byteLength);
  })
  .catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
  });