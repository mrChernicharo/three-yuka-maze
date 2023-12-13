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
let time;
let scene;
let ambientLight;
let camera;
let orbit;
let mouseRay;
let entityManager;
let navMesh;
let graphHelper;
let navMeshHelper; // convexRegionHelper
let agentVehicles = [];
let agentMeshes = [];

const agentBlueprints = [
  { speed: 10, pos: new THREE.Vector3(19, 1.5, 18.5), color: 0x00ff00, spawnAt: 0 },
  // { speed: 8, pos: new THREE.Vector3(19, 1.5, 17), color: 0xff0000, spawnAt: 2 },
  // { speed: 10, pos: new THREE.Vector3(17, 1.5, 18.5), color: 0x00ff00, spawnAt: 4 },
  // { speed: 10, pos: new THREE.Vector3(16, 1.5, 18.5), color: 0x00ff00, spawnAt: 6 },
  // { speed: 10, pos: new THREE.Vector3(16, 1.5, 17), color: 0x00ff00, spawnAt: 8 },
  // { speed: 8, pos: new THREE.Vector3(18.5, 1.5, 16), color: 0xff0000, spawnAt: 10 },
  // { speed: 10, pos: new THREE.Vector3(17, 1.5, 17), color: 0x00ff00, spawnAt: 12 },
  { speed: 5, pos: new THREE.Vector3(-18, 1.5, 18), color: 0xff0000, spawnAt: 2 },
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

  entityManager = new YUKA.EntityManager();
  time = new YUKA.Time();
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

  navMesh = await navMeshLoader.load("/assets/MAZE-NavMesh.glb");

  const graph = navMesh.graph;
  graphHelper = createGraphHelper(graph, 0.2);
  scene.add(graphHelper);

  navMeshHelper = createConvexRegionHelper(navMesh);
  scene.add(navMeshHelper);

  console.log({ glb, levelMap, navMeshLoader, navMesh });
}

function drawAgents() {
  const agentRadius = 0.25;
  const agentHeight = 1;
  const agentGeometry = new THREE.CylinderGeometry(agentRadius, 0, agentHeight);

  for (let i = 0; i < agentBlueprints.length; i++) {
    const agent = agentBlueprints[i];
    const agentMaterial = new THREE.MeshBasicMaterial({ color: agent.color });
    const agentMesh = new THREE.Mesh(agentGeometry, agentMaterial);
    agentMesh.name = "Agent Mesh";
    agentMesh.position.set(agent.pos.x, agent.pos.y, agent.pos.z);

    const agentVehicle = new YUKA.Vehicle();
    agentVehicle.name = "Agent Vehicle";
    agentVehicle.boundingRadius = agentGeometry.boundingSphere;
    agentVehicle.maxSpeed = 12;
    agentVehicle.mass = 0.5;
    agentVehicle.setRenderComponent(agentMesh, (entity, renderComponent) => {
      renderComponent.matrix.copy(entity.worldMatrix);
    });
    agentVehicle.position.copy(agentMesh.position);

    const followPathBehavior = new YUKA.FollowPathBehavior();
    followPathBehavior.active = false;
    followPathBehavior.nextWaypointDistance = 1;
    agentVehicle.steering.add(followPathBehavior);

    scene.add(agentMesh);
    entityManager.add(agentVehicle);
    agentMeshes.push(agentMesh);
    agentVehicles.push(agentVehicle);
  }
}

function setupDomListeners() {
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    console.log(camera);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener("click", (e) => {
    const mouseClickPos = new THREE.Vector2();
    mouseClickPos.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseClickPos.y = -(e.clientY / window.innerHeight) * 2 + 1;

    mouseRay = new THREE.Raycaster();
    mouseRay.setFromCamera(mouseClickPos, camera);

    const intersects = mouseRay.intersectObject(navMeshHelper);

    console.log(intersects);

    if (intersects.length > 0) {
      entityManager.entities.forEach((entity, i) => {
        const agentVehicle = agentVehicles[i];
        const path = findPathTo(agentVehicle.position, new YUKA.Vector3().copy(intersects[0].point));

        const followPathBehavior = agentVehicle.steering.behaviors[0];
        followPathBehavior.path.clear();
        followPathBehavior.active = true;
        for (const point of path) {
          followPathBehavior.path.add(point);
        }
        console.log(agentVehicle, path, followPathBehavior);
      });

      function findPathTo(from, to) {
        return navMesh.findPath(from, to);
      }
    }
  });
}

function animate() {
  orbit.update();

  // agentVehicles.forEach((v) => {
  // console.log(v.steering.behaviors[0]);
  // v.position.copy(followPathBehavior.path.current());
  // });
  // console.log(agentVehicles[0].position);
  agentVehicles.forEach((v, i) => {
    agentMeshes[i].position.copy(v.position);
    // agentVehicle.position.copy(path.current());
    // agentVehicle.rotation.copy(new Quaternion(agentMesh.quaternion));
  });
  const delta = time.update().getDelta();
  entityManager.update(delta);
  renderer.render(scene, camera);

  // requestAnimationFrame(animate);
}

function main() {
  init();

  setupDomListeners();

  drawMapAndNavMesh();

  drawAgents();

  // requestAnimationFrame(animate);
  renderer.setAnimationLoop(animate);
}

main();
