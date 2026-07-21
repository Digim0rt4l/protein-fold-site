import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COLOR_HELIX = 0x35d9c0;
const COLOR_COIL = 0x8993a4;
const COLOR_ACTIVE = 0xffb454;
const COLOR_SIDECHAIN = 0x5b6b85;
const RADIAL_SEGMENTS = 12;
const SIDE_CHAIN_SPHERE_RADIUS = { 1: 0.5, 2: 0.7, 3: 0.9 };

let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let container = null;
let group = null;
let activePulse = { mesh: null, t: 0 };

function init(containerEl) {
  container = containerEl;

  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 500);
    camera.position.set(0, 30, 65);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
  } catch (error) {
    container.innerHTML = "<p class=\"viewer-fallback\">3D rendering isn't supported in this browser.</p>";
    return;
  }

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(30, 50, 40);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x35d9c0, 0.4);
  rimLight.position.set(-40, -20, -30);
  scene.add(rimLight);

  group = new THREE.Group();
  scene.add(group);

  window.addEventListener("resize", onResize);
  animate();
}

function onResize() {
  if (!container || !renderer || !camera) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

function clearGroup() {
  while (group.children.length) {
    const obj = group.children.pop();
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }
}

function centerOf(coords) {
  const center = new THREE.Vector3();
  coords.forEach((point) => center.add(new THREE.Vector3(point.x, point.y, point.z)));
  center.divideScalar(coords.length);
  return center;
}

function subtractVector(point, center) {
  return { x: point.x - center.x, y: point.y - center.y, z: point.z - center.z };
}

function isHighlightedResidue(residueNumber, highlightResidue) {
  return highlightResidue != null && residueNumber === highlightResidue;
}

function colorForResidue(residueNumber, helices, highlightResidue) {
  if (isHighlightedResidue(residueNumber, highlightResidue)) return COLOR_ACTIVE;
  if (helices.some((helix) => residueNumber >= helix.start && residueNumber <= helix.end)) return COLOR_HELIX;
  return COLOR_COIL;
}

function createSideChainMaterial(color, highlighted) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: highlighted ? 0.7 : 0.2,
    roughness: 0.5
  });
}

function createBondLine(pointA, pointB, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(pointA.x, pointA.y, pointA.z),
    new THREE.Vector3(pointB.x, pointB.y, pointB.z)
  ]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
  return new THREE.Line(geometry, material);
}

function render(residues, helices, highlightResidue) {
  if (!scene || !group) return;
  clearGroup();
  activePulse.mesh = null;
  if (!residues || residues.length < 2) return;

  const caPoints = residues.map((residue) => residue.CA);
  const center = centerOf(caPoints);
  const centeredResidues = residues.map((residue) => ({
    CA: subtractVector(residue.CA, center),
    CB: residue.CB ? subtractVector(residue.CB, center) : null,
    SC: residue.SC ? subtractVector(residue.SC, center) : null,
    sideChainSize: residue.sideChainSize
  }));

  const vectors = centeredResidues.map((residue) => new THREE.Vector3(residue.CA.x, residue.CA.y, residue.CA.z));
  const curve = new THREE.CatmullRomCurve3(vectors, false, "catmullrom", 0.2);
  const tubularSegments = Math.max(200, residues.length * 8);
  const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, 0.55, RADIAL_SEGMENTS, false);

  const colors = [];
  for (let i = 0; i <= tubularSegments; i++) {
    const fraction = i / tubularSegments;
    const residueIndex = Math.min(residues.length - 1, Math.round(fraction * (residues.length - 1)));
    const residueNumber = residueIndex + 1;
    const color = new THREE.Color(colorForResidue(residueNumber, helices, highlightResidue));
    for (let ring = 0; ring < RADIAL_SEGMENTS + 1; ring++) colors.push(color.r, color.g, color.b);
  }
  tubeGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const tubeMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.35,
    metalness: 0.1,
    emissive: 0x0a0d12,
    emissiveIntensity: 0.15
  });
  group.add(new THREE.Mesh(tubeGeometry, tubeMaterial));

  const sphereGeometry = new THREE.SphereGeometry(0.85, 12, 12);

  centeredResidues.forEach((residue, index) => {
    const residueNumber = index + 1;
    const highlighted = isHighlightedResidue(residueNumber, highlightResidue);
    const color = colorForResidue(residueNumber, helices, highlightResidue);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: highlighted ? 0.9 : 0.25
    });
    const sphere = new THREE.Mesh(sphereGeometry, material);
    sphere.position.set(residue.CA.x, residue.CA.y, residue.CA.z);
    group.add(sphere);
    if (highlighted) activePulse.mesh = sphere;

    if (residue.CB) {
      const sideChainColor = highlighted ? COLOR_ACTIVE : COLOR_SIDECHAIN;
      const sideChainRadius = SIDE_CHAIN_SPHERE_RADIUS[residue.sideChainSize] || SIDE_CHAIN_SPHERE_RADIUS[1];
      const sideChainGeometry = new THREE.SphereGeometry(sideChainRadius, 10, 10);
      const sideChainSphere = new THREE.Mesh(sideChainGeometry, createSideChainMaterial(sideChainColor, highlighted));
      sideChainSphere.position.set(residue.CB.x, residue.CB.y, residue.CB.z);
      group.add(sideChainSphere);

      group.add(createBondLine(residue.CA, residue.CB, sideChainColor));

      if (residue.SC) {
        const distalGeometry = new THREE.SphereGeometry(sideChainRadius * 0.75, 10, 10);
        const distalSphere = new THREE.Mesh(distalGeometry, createSideChainMaterial(sideChainColor, highlighted));
        distalSphere.position.set(residue.SC.x, residue.SC.y, residue.SC.z);
        group.add(distalSphere);

        group.add(createBondLine(residue.CB, residue.SC, sideChainColor));
      }
    }
  });
}

function animate() {
  requestAnimationFrame(animate);
  if (activePulse.mesh) {
    activePulse.t += 0.06;
    const scale = 1 + 0.35 * Math.abs(Math.sin(activePulse.t));
    activePulse.mesh.scale.setScalar(scale);
  }
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

window.ProteinViewer = { init, render };
