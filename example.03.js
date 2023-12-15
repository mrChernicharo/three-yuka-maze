import * as THREE from "three";
import * as YUKA from "yuka";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { createGraphHelper } from "./GraphHelper.js";
import { createConvexRegionHelper } from "./NavMeshHelper.js";
import { Pathfinding, PathfindingHelper } from "three-pathfinding";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

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
let pathfinding;
let pathfindingHelpers = [];
let graphHelper;
let navMeshHelper; // convexRegionHelper
let agentVehicles = [];
let agentMeshes = [];
let paths = [];
let obstacles = [];
let model;
let mixers = [];
let animationActions = [];
const ZONE_ID = "level1";
const npcBlueprints = [
  { speed: 14, pos: new THREE.Vector3(0, 0.2, 18.5), color: 0x00ff00, weapon: "Knife_1", spawnAt: 0 },
  //   { speed: 14, pos: new THREE.Vector3(19, 0.2, 18.5), color: 0x00ff00, weapon: "Knife_1", spawnAt: 0 },
  //   { speed: 8, pos: new THREE.Vector3(19, 0.2, 17), color: 0xff8800, weapon: "Knife_1", spawnAt: 2 },
  //   { speed: 10, pos: new THREE.Vector3(17, 0.2, 18.5), color: 0x88ffaa, weapon: "Knife_1", spawnAt: 4 },
  //   { speed: 10, pos: new THREE.Vector3(16, 0.2, 18.5), color: 0x00ff88, weapon: "Knife_1", spawnAt: 6 },
  //   { speed: 10, pos: new THREE.Vector3(16, 0.2, 17), color: 0x88ff00, weapon: "Knife_1", spawnAt: 8 },
  //   { speed: 8, pos: new THREE.Vector3(18.5, 0.2, 16), color: 0xff0000, weapon: "Knife_1", spawnAt: 10 },
  //   { speed: 10, pos: new THREE.Vector3(17, 0.2, 17), color: 0x00ffff, weapon: "Knife_1", spawnAt: 12 },
  //   { speed: 12, pos: new THREE.Vector3(-18, 0.2, 18), color: 0xffff00, weapon: "Knife_1", spawnAt: 2 },
  { speed: 16, pos: new THREE.Vector3(-18, 0.2, -18), color: 0xa000ff, weapon: "Knife_1", spawnAt: 5 },
];
// let npcAnimations = [];
// let animationClips = [];

function init() {
  glTFLoader = new GLTFLoader();
  //   navMeshLoader = new YUKA.NavMeshLoader();
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x232323);
  document.body.appendChild(renderer.domElement);
  clock = new THREE.Clock();
  scene = new THREE.Scene();
  ambientLight = new THREE.AmbientLight(0xffffdd, 2);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
  camera.position.set(0, 30, 60);
  orbit = new OrbitControls(camera, renderer.domElement);
  scene.add(camera);
  scene.add(ambientLight);
  entityManager = new YUKA.EntityManager();
  time = new YUKA.Time();
}

function setupPathfinder() {
  pathfinding = new Pathfinding();

  pathfinding.setZoneData(ZONE_ID, Pathfinding.createZone(navMesh.geometry));
  console.log("setupPathfinder", { pathfinding, navMesh });

  for (const _ of npcBlueprints) {
    const pathfindingHelper = new PathfindingHelper();
    // console.log("setupPathfinder", { navMesh, pathfinding, pathfindingHelper });
    scene.add(pathfindingHelper);
    pathfindingHelpers.push(pathfindingHelper);
  }
}

async function drawMapAndNavMesh() {
  const glb = await glTFLoader.loadAsync("/assets/new-map.glb");
  const navMeshGlb = await glTFLoader.loadAsync("/assets/new-map-navmesh.glb");
  const stoneTexture = await new THREE.TextureLoader().loadAsync("/assets/stoneTexture.jpeg");
  const bricksTexture = await new THREE.TextureLoader().loadAsync("/assets/bricksTexture.jpeg");

  const obstacleObjs = glb.scene.children.filter((ch) => ch.name.includes("Obstacle"));
  const levelObjs = glb.scene.children.filter((ch) => !ch.name.includes("Obstacle"));
  //   navMesh = glb.scene.children.filter((ch) => !ch.name.includes("Nav"));
  navMesh = navMeshGlb.scene.getObjectByName("Navmesh");
  console.log({ navMesh, glb, obstacleObjs, levelObjs });

  levelObjs.forEach((obj) => {
    const mapTexture = stoneTexture.clone();
    mapTexture.wrapS = THREE.RepeatWrapping;
    mapTexture.wrapT = THREE.RepeatWrapping;
    obj.name.includes("Ramp") ? mapTexture.repeat.set(6, 18) : mapTexture.repeat.set(25, 35);
    obj.material = new THREE.MeshBasicMaterial({ color: 0xababab, map: mapTexture });
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
  const gridHelper = new THREE.GridHelper(12, 12);
  // scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(12);
  axesHelper.position.set(20, 0, 20);
  scene.add(axesHelper);
}

async function drawAgents() {
  const glTF = await glTFLoader.loadAsync("/assets/Character_Hazmat.gltf");

  model = glTF.scene;
  model.scale.set(2, 2, 2);

  for (let i = 0; i < npcBlueprints.length; i++) {
    const npc = npcBlueprints[i];
    const modelClone = SkeletonUtils.clone(model);
    equipWeapon(modelClone, npc.weapon);
    modelClone.position.set(npc.pos.x, npc.pos.y, npc.pos.z);
    scene.add(modelClone);
    agentMeshes.push(modelClone);
  }
  // console.log({ glTF, model });
  setupMixerAndActions(glTF.animations);
}

function equipWeapon(model, gunName) {
  const handObject = model.getObjectByName("Index1R");
  [...handObject.children].forEach((gunObj) => {
    // console.log(gunObj.name);
    if (gunObj.name !== gunName) {
      gunObj.visible = false;
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

      //   paths = [];
      for (let i = 0; i < agentMeshes.length; i++) {
        const agentGroup = agentMeshes[i];
        const pathfindingHelper = pathfindingHelpers[i];

        let groupId = pathfinding.getGroup(ZONE_ID, agentGroup.position);

        const closestNode = pathfinding.getClosestNode(agentGroup.position, ZONE_ID, groupId);

        const path = pathfinding.findPath(closestNode.centroid, intersect.point, ZONE_ID, groupId);
        if (path) {
          paths[i] = path;
          //   console.log({ found, paths, navmesh, pathfinding, targetPos, agentGroup, closest });

          if (paths[i]) {
            pathfindingHelper.reset();
            pathfindingHelper.setPlayerPosition(closestNode);
            pathfindingHelper.setTargetPosition(intersect.point);
            pathfindingHelper.setPath(paths[i]);
          }
        }
      }
    }
  });
}

function moveAgents(deltaTime) {
  for (let i = 0; i < agentMeshes.length; i++) {
    const idleAction = animationActions[i].find((a) => a._clip.name === "Idle");
    const runAction = animationActions[i].find((a) => a._clip.name === "Run");

    if (!paths[i] || paths[i].length <= 0) {
      if (runAction.isRunning()) {
        console.log("STOP!");
        runAction.stop();
        idleAction.play();
      }
      continue;
    }

    if (!runAction.isRunning()) {
      console.log("RUN!");
      idleAction.stop();
      runAction.play();
    }

    let targetPos = paths[i][0];
    const velocity = targetPos.clone().sub(agentMeshes[i].position);

    if (velocity.lengthSq() > 0.5 * 0.005) {
      velocity.normalize();
      const finalVel = velocity.multiplyScalar(deltaTime * npcBlueprints[i].speed);
      agentMeshes[i].lookAt(targetPos);
      //   console.log(i, velocity.lengthSq(), finalVel);
      agentMeshes[i].position.add(finalVel);
    } else {
      paths[i].shift();
      //   console.log("hit waypoint!");
    }
  }
}

function setupMixerAndActions(animations) {
  for (let i = 0; i < agentMeshes.length; i++) {
    const mixer = new THREE.AnimationMixer(agentMeshes[i]);
    mixers[i] = mixer;
    animationActions[i] = [];

    for (const animationClip of animations) {
      //   console.log(animationClip.name);
      const action = mixers[i].clipAction(animationClip);
      animationActions[i].push(action);
    }
  }

  console.log({ animationActions, mixers });
}

function animate() {
  orbit.update();
  const delta = clock.getDelta();
  moveAgents(delta);

  //   console.log(agentMeshes[0].userData);
  for (let i = 0; i < mixers.length; i++) {
    mixers[i].update(delta);
  }
  renderer.render(scene, camera);
}

export async function example03() {
  init();

  setupDomListeners();

  await drawMapAndNavMesh();

  setupPathfinder();

  await drawAgents();

  renderer.setAnimationLoop(animate);
}
