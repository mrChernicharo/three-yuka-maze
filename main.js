import * as THREE from "three";
import * as YUKA from "yuka";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { Quaternion } from "yuka";
import { createGraphHelper } from "./GraphHelper.js";
import { createConvexRegionHelper } from "./NavMeshHelper.js";

console.log({ THREE, YUKA });

let glTFLoader;
let navMeshLoader;
let renderer;
let clock;
let yukaTime;
let scene;
let ambientLight;
let camera;
let orbit;
let mouseRay;
let entityManager;
let graphHelper;

const agentBlueprints = [
  { speed: 10, pos: new THREE.Vector3(19, 1.5, 18.5), color: 0x00ff00, spawnAt: 0 },
  { speed: 8, pos: new THREE.Vector3(19, 1.5, 17), color: 0xff0000, spawnAt: 2 },
  { speed: 10, pos: new THREE.Vector3(17, 1.5, 18.5), color: 0x00ff00, spawnAt: 4 },
  { speed: 10, pos: new THREE.Vector3(16, 1.5, 18.5), color: 0x00ff00, spawnAt: 6 },
  { speed: 10, pos: new THREE.Vector3(16, 1.5, 17), color: 0x00ff00, spawnAt: 8 },
  { speed: 8, pos: new THREE.Vector3(18.5, 1.5, 16), color: 0xff0000, spawnAt: 10 },
  { speed: 10, pos: new THREE.Vector3(17, 1.5, 17), color: 0x00ff00, spawnAt: 12 },
  // { speed: 5, pos: new THREE.Vector3(-18, 1.5, 18), color: 0xff0000, spawnAt: 2 },
  // { speed: 20, pos: new THREE.Vector3(-18, 1.5, -18), color: 0x0000ff, spawnAt: 5 },
];

function init() {
  glTFLoader = new GLTFLoader();
  navMeshLoader = new YUKA.NavMeshLoader();
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x232323);
  document.body.appendChild(renderer.domElement);
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  ambientLight = new THREE.AmbientLight(0xffffdd, 200);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
  camera.position.set(35, 20, 50);
  orbit = new OrbitControls(camera, renderer.domElement);
  scene.add(camera);
  scene.add(ambientLight);
  mouseRay = new THREE.Raycaster();

  entityManager = new YUKA.EntityManager();
  yukaTime = new YUKA.Time();
}

async function drawMapAndNavMesh() {
  // const gridHelper = new THREE.GridHelper(12, 12);
  // scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(12);
  axesHelper.position.set(20, 0, 20);
  scene.add(axesHelper);

  const glb = await glTFLoader.loadAsync("/assets/MAZE-Map.glb");
  const stoneTexture = await new THREE.TextureLoader().loadAsync("/assets/stoneTexture.jpeg");

  const [levelMap] = glb.scene.children;
  const mapTexture = stoneTexture.clone();
  mapTexture.wrapS = THREE.RepeatWrapping;
  mapTexture.wrapT = THREE.RepeatWrapping;
  mapTexture.repeat.set(25, 25);
  levelMap.material = new THREE.MeshBasicMaterial({ color: 0x6868686, map: mapTexture });
  // navMesh.material = new THREE.MeshBasicMaterial({ transparent: true, color: 0x884444, opacity: 0.2 });
  // scene.add(navMesh);

  scene.add(levelMap);

  const navMesh = await navMeshLoader.load("/assets/MAZE-NavMesh.glb");
  const graph = navMesh.graph;
  const graphHelper = createGraphHelper(graph, 0.2);
  scene.add(graphHelper);

  console.log(navMeshLoader, navMesh);

  const convexRegHelper = createConvexRegionHelper(navMesh);
  scene.add(convexRegHelper);

  console.log({ glb, levelMap });
}

function drawAgents() {
  for (let i = 0; i < agentBlueprints.length; i++) {
    const agent = agentBlueprints[i];
    const agentRadius = 0.25;
    const agentHeight = 1;
    const agentGeometry = new THREE.CylinderGeometry(agentRadius, 0, agentHeight);
    const agentMaterial = new THREE.MeshBasicMaterial({ color: agent.color });
    const agentMesh = new THREE.Mesh(agentGeometry, agentMaterial);
    agentMesh.position.set(agent.pos.x, agent.pos.y, agent.pos.z);
    agentMesh.lookAt(new THREE.Vector3(0, 1, 0));

    const agentVehicle = new YUKA.Vehicle();
    agentVehicle.boundingRadius = agentGeometry.boundingSphere;
    agentVehicle.maxSpeed = 12;
    agentVehicle.mass = 0.5;
    agentVehicle.setRenderComponent(agentMesh, (entity, renderComponent) => {
      renderComponent.matrix.copy(entity.worldMatrix);
    });
    // agentVehicle.position.copy(path.current());
    agentVehicle.rotation.copy(new Quaternion(agentMesh.quaternion));

    const followPathBehavior = new YUKA.FollowPathBehavior();
    followPathBehavior.active = false;
    followPathBehavior.nextWaypointDistance = 0.5;

    agentVehicle.steering.add(followPathBehavior);

    // agentVehicle.maxSpeed = THREE.MathUtils.lerp(2, 8.5, Math.random());
    // agentVehicle.mass = THREE.MathUtils.lerp(0.1, 1.2, Math.random());
    agentVehicle.name = `mass ${agentVehicle.mass} maxSpeed ${agentVehicle.maxSpeed}`;
    console.log(agentVehicle.name);

    entityManager.add(agentVehicle);

    setTimeout(() => {
      scene.add(agentMesh);
    }, agent.spawnAt * 1000);
  }
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

    console.log(mouseRay);
  });
}

function animate() {
  orbit.update();
  const delta = yukaTime.update().getDelta();
  entityManager.update(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function main() {
  init();

  setupDomListeners();

  drawMapAndNavMesh();

  drawAgents();

  requestAnimationFrame(animate);
}

main();
