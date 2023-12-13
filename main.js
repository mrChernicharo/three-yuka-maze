import * as THREE from "three";
// import * as YUKA from "yuka";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

console.log({ THREE });

const glTFLoader = new GLTFLoader();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x232323);
document.body.appendChild(renderer.domElement);
const clock = new THREE.Clock();
const scene = new THREE.Scene();
const ambientLight = new THREE.AmbientLight(0xffffdd, 200);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
camera.position.set(-4, 10, 20);
const orbit = new OrbitControls(camera, renderer.domElement);
scene.add(camera);
scene.add(ambientLight);
const mouseRay = new THREE.Raycaster();

const gridHelper = new THREE.GridHelper(12, 12);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(12);
scene.add(axesHelper);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("click", (e) => {
  const mouseClickPos = new THREE.Vector2();
  mouseClickPos.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseClickPos.y = -(e.clientY / window.innerHeight) * 2 + 1;

  mouseRay.setFromCamera(mouseClickPos, camera);
});

function animate() {
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function main() {
  requestAnimationFrame(animate);
}

main();
