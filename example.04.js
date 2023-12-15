import * as THREE from "three";
import * as YUKA from "yuka";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { createGraphHelper } from "./GraphHelper.js";
import { createConvexRegionHelper } from "./NavMeshHelper.js";
import { Pathfinding, PathfindingHelper } from "three-pathfinding";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

console.log({ THREE, YUKA });

const waypoints = [
  new THREE.Vector3(2, 5, -45),
  new THREE.Vector3(-11.5, 0.5, 5.5),
  new THREE.Vector3(-18.5, 0.5, 14),
  new THREE.Vector3(-17.5, 5, -76),
  new THREE.Vector3(-12.5, 5, -76),
];

let glTFLoader;
let navMeshLoader;
let yukaNav;
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
  { speed: 16, pos: new THREE.Vector3(16, 5.2, -62), color: 0x00ff00, weapon: "Revolver", spawnAt: 0 },
  { speed: 16, pos: new THREE.Vector3(12, 5.2, -79), color: 0x00ff00, weapon: "Sniper", spawnAt: 0 },
  { speed: 16, pos: new THREE.Vector3(-10, 5.2, -78), color: 0x00ff00, weapon: "Pistol", spawnAt: 0 },
  { speed: 16, pos: new THREE.Vector3(-17, 5.2, -49), color: 0x00ff00, weapon: "SMG", spawnAt: 0 },

  //   { speed: 14, pos: new THREE.Vector3(-17, 5.2, -59), color: 0x00ff00, weapon: "SMG", spawnAt: 0 },
  //   { speed: 12, pos: new THREE.Vector3(5, 5.2, -75), color: 0x00ff00, weapon: "Sniper", spawnAt: 0 },
  //   { speed: 20, pos: new THREE.Vector3(-17, 5.2, -79), color: 0x00ff00, weapon: "Pistol", spawnAt: 0 },
  //   { speed: 16, pos: new THREE.Vector3(16, 5.2, -79), color: 0x00ff00, weapon: "Revolver", spawnAt: 0 },

  //   { speed: 12, pos: new THREE.Vector3(-18, 0.2, 18), color: 0xffff00, weapon: "Knife_1", spawnAt: 2 },
  //   { speed: 16, pos: new THREE.Vector3(-18, 0.2, -18), color: 0xa000ff, weapon: "GrenadeLauncher", spawnAt: 5 },
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
  ambientLight = new THREE.AmbientLight(0xffffdd, 2);
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
  camera.position.set(-18, 144, -163);
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
  navMeshLoader.load("/assets/new-map-navmesh.glb").then((nav) => {
    yukaNav = nav;
  });

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
    agentMeshes[i].userData["wp_index"] = 0;
  }
  // console.log({ glTF, model });
  setupMixerAndActions(glTF.animations);
}

function equipWeapon(model, gunName) {
  const handObject = model.getObjectByName("Index1R");
  [...handObject.children].forEach((gunObj) => {
    if (gunObj.name !== gunName) {
      gunObj.visible = false;
    }
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  console.log({ camera });
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onClick(e) {
  const mouseClickPos = new THREE.Vector2();
  mouseClickPos.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseClickPos.y = -(e.clientY / window.innerHeight) * 2 + 1;

  mouseRay = new THREE.Raycaster();
  mouseRay.setFromCamera(mouseClickPos, camera);

  const intersects = mouseRay.intersectObject(scene);
  if (intersects.length > 0) {
    const intersect = intersects.find((intersect) => intersect.object.name);
    console.log(intersect.point);

    triggerMove();
  }
}

function triggerMove() {
  for (let i = 0; i < agentMeshes.length; i++) {
    try {
      const agentGroup = agentMeshes[i];
      const wayPointIdx = agentMeshes[i].userData["wp_index"];

      let groupId = pathfinding.getGroup(ZONE_ID, agentGroup.position);

      const closestNode = pathfinding.getClosestNode(agentGroup.position, ZONE_ID, groupId);

      //   const path = pathfinding.findPath(closestNode.centroid, intersect.point, ZONE_ID, groupId);
      const path = pathfinding.findPath(closestNode.centroid, waypoints[wayPointIdx], ZONE_ID, groupId);

      if (path) {
        paths[i] = path;
        // drawPathHelper(i, closestNode, wayPointIdx);
      }
    } catch (err) {}
  }
}

function drawPathHelper(i, closestNode, wayPointIdx) {
  if (paths[i]) {
    pathfindingHelpers[i].reset();
    pathfindingHelpers[i].setPlayerPosition(closestNode);
    pathfindingHelpers[i].setTargetPosition(waypoints[wayPointIdx]);
    pathfindingHelpers[i].setPath(paths[i]);
  }
}

function setupDomListeners() {
  window.addEventListener("resize", onResize);
  window.addEventListener("click", onClick);
}

function moveAgents(deltaTime) {
  for (let i = 0; i < agentMeshes.length; i++) {
    const idleAction = animationActions[i].find((a) => a._clip.name === "Idle");
    const runAction = animationActions[i].find((a) => a._clip.name === "Run");

    if (!paths[i] || paths[i].length <= 0) {
      if (runAction.isRunning()) {
        const isLastWaypoint = agentMeshes[i].userData["wp_index"] === waypoints.length;
        if (isLastWaypoint) {
          //   console.log("STOP!");
          //   runAction.stop();
          //   idleAction.play();
          agentMeshes[i].userData["wp_index"] = 0;
          triggerMove();
        } else {
          triggerMove();
        }
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
      agentMeshes[i].lookAt(targetPos);

      velocity.normalize();
      const finalVel = velocity.multiplyScalar(deltaTime * npcBlueprints[i].speed);

      agentMeshes[i].position.add(finalVel);

      const currentRegion = yukaNav.getClosestRegion(new YUKA.Vector3().copy(agentMeshes[i].position), 1);
      if (currentRegion) {
        const distanceToGround = currentRegion.centroid.y - agentMeshes[i].position.y;
        if (Math.abs(distanceToGround) > 0.1) {
          if (agentMeshes[i].position.y < currentRegion.centroid.y) {
            agentMeshes[i].position.y += 0.02;
          } else {
            agentMeshes[i].position.y -= 0.02;
          }
        }
      }
    } else {
      paths[i].shift();
      const isLastPathKeyPoint = paths[i].length == 1;
      if (isLastPathKeyPoint) {
        console.log({ i, wp: agentMeshes[i].userData["wp_index"] });
        agentMeshes[i].userData["wp_index"]++;
      }
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
  const delta = clock.getDelta();
  moveAgents(delta);

  for (let i = 0; i < mixers.length; i++) {
    mixers[i].update(delta);
  }

  orbit.update();
  renderer.render(scene, camera);
}

export async function example04() {
  init();

  setupDomListeners();

  await drawMapAndNavMesh();

  setupPathfinder();

  await drawAgents();

  renderer.setAnimationLoop(animate);
}
