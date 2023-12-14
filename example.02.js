import * as THREE from "three";
import * as YUKA from "yuka";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
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
let paths = [];
let obstacles = [];

const agentBlueprints = [
  { speed: 14, pos: new THREE.Vector3(19, 1.5, 18.5), color: 0x00ff00, spawnAt: 0 },
  // { speed: 8, pos: new THREE.Vector3(19, 1.5, 17), color: 0xff8800, spawnAt: 2 },
  // { speed: 10, pos: new THREE.Vector3(17, 1.5, 18.5), color: 0x88ffaa, spawnAt: 4 },
  // { speed: 10, pos: new THREE.Vector3(16, 1.5, 18.5), color: 0x00ff88, spawnAt: 6 },
  // { speed: 10, pos: new THREE.Vector3(16, 1.5, 17), color: 0x88ff00, spawnAt: 8 },
  // { speed: 8, pos: new THREE.Vector3(18.5, 1.5, 16), color: 0xff0000, spawnAt: 10 },
  // { speed: 10, pos: new THREE.Vector3(17, 1.5, 17), color: 0x00ffff, spawnAt: 12 },
  // { speed: 12, pos: new THREE.Vector3(-18, 1.5, 18), color: 0xffff00, spawnAt: 2 },
  // { speed: 16, pos: new THREE.Vector3(-18, 1.5, -18), color: 0xa000ff, spawnAt: 5 },
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
  camera.position.set(0, 30, 60);
  orbit = new OrbitControls(camera, renderer.domElement);
  scene.add(camera);
  scene.add(ambientLight);

  entityManager = new YUKA.EntityManager();
  time = new YUKA.Time();
}

async function drawMapAndNavMesh() {
  const glb = await glTFLoader.loadAsync("/assets/new-map.glb");
  navMesh = await navMeshLoader.load("/assets/new-map-navmesh.glb");
  const stoneTexture = await new THREE.TextureLoader().loadAsync("/assets/stoneTexture.jpeg");
  const bricksTexture = await new THREE.TextureLoader().loadAsync("/assets/bricksTexture.jpeg");

  const obstacleObjs = glb.scene.children.filter((ch) => ch.name.includes("Obstacle"));
  const levelObjs = glb.scene.children.filter((ch) => !ch.name.includes("Obstacle"));
  console.log({ obstacleObjs, levelObjs });

  levelObjs.forEach((obj) => {
    const mapTexture = stoneTexture.clone();
    mapTexture.wrapS = THREE.RepeatWrapping;
    mapTexture.wrapT = THREE.RepeatWrapping;
    obj.name.includes("Ramp") ? mapTexture.repeat.set(6, 18) : mapTexture.repeat.set(25, 35);
    obj.material = new THREE.MeshBasicMaterial({ color: 0x686868, map: mapTexture });
    scene.add(obj);
    obj.userData.name = "Map";
  });

  obstacleObjs.forEach((obj) => {
    const mapTexture = bricksTexture.clone();
    mapTexture.wrapS = THREE.RepeatWrapping;
    mapTexture.wrapT = THREE.RepeatWrapping;
    mapTexture.repeat.set(2, 4);

    obj.material = new THREE.MeshBasicMaterial({ color: 0x686868, map: mapTexture });
    obj.userData.name = "Obstacle";
    scene.add(obj);

    const obstacle = new YUKA.GameEntity();
    obstacle.position.copy(obj.position);
    obstacle.boundingRadius = obj.geometry.boundingSphere.radius;
    obstacle.lineOfSightTest();
    obstacles.push(obstacle);
    entityManager.add(obstacle);
  });

  // HELPERS
  const graph = navMesh.graph;
  graphHelper = createGraphHelper(graph, 0.2, 0x00ff00, 0xffffff);
  scene.add(graphHelper);

  navMeshHelper = createConvexRegionHelper(navMesh);
  navMeshHelper.material = new THREE.MeshBasicMaterial({ transparent: true, color: 0x0055dd, opacity: 0.2 });
  // scene.add(navMeshHelper);

  const gridHelper = new THREE.GridHelper(12, 12);
  // scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(12);
  axesHelper.position.set(20, 0, 20);
  scene.add(axesHelper);

  console.log({ glb, navMeshLoader, navMesh });
}

function drawAgents() {
  const agentRadius = 0.25;
  const agentHeight = 2;
  const agentGeometry = new THREE.CylinderGeometry(0, agentRadius, agentHeight);
  agentGeometry.computeBoundingSphere();
  agentGeometry.rotateX(Math.PI / 2);

  for (let i = 0; i < agentBlueprints.length; i++) {
    const agent = agentBlueprints[i];
    const agentMaterial = new THREE.MeshBasicMaterial({ color: agent.color });
    const agentMesh = new THREE.Mesh(agentGeometry, agentMaterial);
    agentMesh.name = "Agent Mesh";
    agentMesh.position.set(agent.pos.x, agent.pos.y, agent.pos.z);

    const agentVehicle = new YUKA.Vehicle();
    agentVehicle.name = "Agent Vehicle";
    agentVehicle.boundingRadius = agentGeometry.boundingSphere.radius;
    agentVehicle.maxSpeed = agent.speed;
    agentVehicle.mass = 0.5;
    // agentVehicle.neighborhoodRadius = 1;
    // agentVehicle.updateNeighborhood = true;
    agentVehicle.position.copy(agentMesh.position);
    syncMeshWithVehicle(agentVehicle, agentMesh, i);

    const followPathBehavior = new YUKA.FollowPathBehavior();
    followPathBehavior.active = false;
    followPathBehavior.nextWaypointDistance = 2;
    agentVehicle.steering.add(followPathBehavior);

    // const separationBehavior = new YUKA.SeparationBehavior();
    // agentVehicle.steering.add(separationBehavior);
    // separationBehavior.weight = 1;

    console.log({ obstacles });

    const obstacleAvoidanceBehavior = new YUKA.ObstacleAvoidanceBehavior(obstacles);
    // agentVehicle.steering.add(obstacleAvoidanceBehavior);

    scene.add(agentMesh);
    entityManager.add(agentVehicle);
    agentMeshes.push(agentMesh);
    agentVehicles.push(agentVehicle);
  }
}

function syncMeshWithVehicle(agentVehicle, agentMesh, i) {
  agentVehicle.setRenderComponent(agentMesh, (entity, renderComponent) => {
    renderComponent.matrix.copy(entity.worldMatrix);

    renderComponent.position.copy(entity.position);

    const path = paths[i];

    if (entity.position.x > 18) entity.position.x = 18;
    if (entity.position.x < -18) entity.position.x = -18;
    if (entity.position.y < 0.4) entity.position.x = 0.4;
    if (path) {
      const target = path.current();
      renderComponent.lookAt(target.x, target.y, target.z);
    }
  });
}

function setupDomListeners() {
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    console.log({ camera });
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener("click", (e) => {
    const mouseClickPos = new THREE.Vector2();
    mouseClickPos.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseClickPos.y = -(e.clientY / window.innerHeight) * 2 + 1;
    mouseRay = new THREE.Raycaster();
    mouseRay.setFromCamera(mouseClickPos, camera);
    const intersects = mouseRay.intersectObject(scene);

    if (intersects.length > 0) {
      const intersect = intersects.find((int) => int.object.name);
      const isLand = !intersect.object.name.includes("Obstacle");
      console.log(intersect.object.name, isLand);

      paths = [];
      entityManager.entities.forEach((entity, i, arr) => {
        const agentVehicle = agentVehicles[i];
        if (!agentVehicle || !agentVehicle.position) return;

        const path = findPathTo(agentVehicle.position, new YUKA.Vector3().copy(intersect.point));
        if (!path || !path.length) return;

        const followPathBehavior = agentVehicle.steering.behaviors[0];
        followPathBehavior.path.clear();
        followPathBehavior.active = true;
        for (const point of path) {
          followPathBehavior.path.add(point);
        }
        paths.push(followPathBehavior.path);
        path.current && agentVehicle.position.copy(path.current());
        path.current && agentMeshes[i].lookAt(path.current());
        console.log({ agentVehicle, agentMesh: agentMeshes[i], path, followPathBehavior, paths });
      });
    }
  });
}

function findPathTo(from, to) {
  try {
    const path = navMesh.findPath(from, to);
    return path;
  } catch (err) {
    return null;
  }
}

function animate() {
  orbit.update();
  const delta = time.update().getDelta();
  entityManager.update(delta);
  renderer.render(scene, camera);
}

export async function example02() {
  init();

  setupDomListeners();

  await drawMapAndNavMesh();

  drawAgents();

  renderer.setAnimationLoop(animate);
}
