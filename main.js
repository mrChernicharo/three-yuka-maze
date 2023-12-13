import * as THREE from "three";
// import * as YUKA from "yuka";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

console.log({ THREE });

let glTFLoader;
let renderer;
let clock;
let scene;
let ambientLight;
let camera;
let orbit;
let mouseRay;

function init() {
  glTFLoader = new GLTFLoader();

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x232323);
  document.body.appendChild(renderer.domElement);
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  ambientLight = new THREE.AmbientLight(0xffffdd, 200);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
  camera.position.set(-4, 10, 20);
  orbit = new OrbitControls(camera, renderer.domElement);
  scene.add(camera);
  scene.add(ambientLight);
  mouseRay = new THREE.Raycaster();
}

async function setupWorldObjects() {
  // const gridHelper = new THREE.GridHelper(12, 12);
  // scene.add(gridHelper);

  // const axesHelper = new THREE.AxesHelper(12);
  // scene.add(axesHelper);

  const glb = await glTFLoader.loadAsync("/assets/MAZE.glb");
  const stoneTexture = await new THREE.TextureLoader().loadAsync("/assets/stoneTexture.jpeg");

  const [levelMap, navMesh] = glb.scene.children;
  const mapTexture = stoneTexture.clone();
  mapTexture.wrapS = THREE.RepeatWrapping;
  mapTexture.wrapT = THREE.RepeatWrapping;
  mapTexture.repeat.set(25, 25);
  levelMap.material = new THREE.MeshBasicMaterial({ color: 0x6868686, map: mapTexture });
  navMesh.material = new THREE.MeshBasicMaterial({ transparent: true, color: 0x884444, opacity: 0.2 });

  scene.add(levelMap);
  scene.add(navMesh);

  console.log({ glb, levelMap, navMesh });
}

function setupDomListeners() {
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
}

function animate() {
  orbit.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function main() {
  init();

  setupDomListeners();

  setupWorldObjects();

  requestAnimationFrame(animate);
}

main();
