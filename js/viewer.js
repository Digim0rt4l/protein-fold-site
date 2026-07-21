import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const COLOR_HELIX = 0x35d9c0;
const COLOR_COIL = 0x8993a4;
const COLOR_ACTIVE = 0xffb454;

let scene, camera, renderer, controls, container;
let group; // holds current ribbon + spheres
let activePulse = { mesh: null, t: 0 };

function init(containerEl) {
  container = containerEl;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);
  camera.position.set(0, 30, 65);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(30, 50, 40);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x35d9c0, 0.4);
  rim.position.set(-40, -20, -30);
  scene.add(rim);

  group = new THREE.Group();
  scene.add(group);

  window.addEventListener("resize", onResize);
  animate();
}

function onResize() {
  if (!container) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function clearGroup() {
  while (group.children.length) {
    const obj = group.children.pop();
    obj.geometry && obj.geometry.dispose();
    obj.material && obj.material.dispose();
  }
}

function centerOf(coords) {
  const c = new THREE.Vector3();
  coords.forEach((p) => c.add(new THREE.Vector3(p.x, p.y, p.z)));
  c.divideScalar(coords.length);
  return c;
}

// Renders a backbone. `helices` = [{start,end}] (1-indexed, inclusive).
// `highlightRange` = optional {start,end} (1-indexed) to tint amber, e.g.
// the work unit currently being optimized.
function render(coords, helices, highlightRange) {
  clearGroup();
  activePulse.mesh = null;
  if (!coords || coords.length < 2) return;

  const vecs = coords.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  const center = centerOf(coords);
  vecs.forEach((v) => v.sub(center));

  const curve = new THREE.CatmullRomCurve3(vecs, false, "catmullrom", 0.2);
  const tubeGeo = new THREE.TubeGeometry(curve, Math.max(200, coords.length * 8), 0.55, 12, false);

  // Color the tube per-vertex based on nearest residue's secondary structure / highlight.
  const colors = [];
  const posAttr = tubeGeo.attributes.position;
  const segCount = tubeGeo.parameters.tubularSegments;
  for (let i = 0; i <= segCount; i++) {
    const tFrac = i / segCount;
    const resIdx = Math.min(coords.length - 1, Math.round(tFrac * (coords.length - 1)));
    const res1 = resIdx + 1;
    let hex = COLOR_COIL;
    if (helices.some((h) => res1 >= h.start && res1 <= h.end)) hex = COLOR_HELIX;
    if (highlightRange && res1 >= highlightRange.start && res1 <= highlightRange.end) hex = COLOR_ACTIVE;
    const c = new THREE.Color(hex);
    for (let r = 0; r < 12 + 1; r++) colors.push(c.r, c.g, c.b);
  }
  tubeGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const tubeMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.35,
    metalness: 0.1,
    emissive: 0x0a0d12,
    emissiveIntensity: 0.15
  });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  group.add(tube);

  // Small residue markers.
  const sphereGeo = new THREE.SphereGeometry(0.85, 12, 12);
  vecs.forEach((v, idx) => {
    const res1 = idx + 1;
    let hex = COLOR_COIL;
    if (helices.some((h) => res1 >= h.start && res1 <= h.end)) hex = COLOR_HELIX;
    const isHighlighted = highlightRange && res1 >= highlightRange.start && res1 <= highlightRange.end;
    if (isHighlighted) hex = COLOR_ACTIVE;
    const mat = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: isHighlighted ? 0.9 : 0.25 });
    const sphere = new THREE.Mesh(sphereGeo, mat);
    sphere.position.copy(v);
    group.add(sphere);
    if (isHighlighted && idx === Math.floor(((highlightRange.start - 1) + (highlightRange.end - 1)) / 2)) {
      activePulse.mesh = sphere;
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  if (activePulse.mesh) {
    activePulse.t += 0.06;
    const s = 1 + 0.35 * Math.abs(Math.sin(activePulse.t));
    activePulse.mesh.scale.setScalar(s);
  }
  controls && controls.update();
  renderer && renderer.render(scene, camera);
}

window.ProteinViewer = { init, render };
