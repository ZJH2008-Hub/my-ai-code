import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FingertipTrail, ParticleFlower } from "./flower.js";
import { HandTracker } from "./hand-tracker.js";

const canvas = document.querySelector("#webgl");
const app = document.querySelector("#app");
const bootScreen = document.querySelector("#bootScreen");
const bootLabel = document.querySelector("#bootLabel");
const cameraButton = document.querySelector("#cameraButton");
const cameraStartButton = document.querySelector("#cameraStartButton");
const cameraButtonText = document.querySelector("#cameraButtonText");
const cameraPanel = document.querySelector("#cameraPanel");
const cameraVideo = document.querySelector("#cameraVideo");
const landmarkCanvas = document.querySelector("#landmarkCanvas");
const cameraFps = document.querySelector("#cameraFps");
const previewGesture = document.querySelector("#previewGesture");
const confidenceValue = document.querySelector("#confidenceValue");
const liveStatus = document.querySelector("#liveStatus");
const statusText = document.querySelector("#statusText");
const gestureState = document.querySelector("#gestureState");
const bloomValue = document.querySelector("#bloomValue");
const toast = document.querySelector("#toast");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const quality =
  window.innerWidth < 720 ||
  (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) ||
  (navigator.deviceMemory && navigator.deviceMemory <= 4)
    ? "low"
    : "high";

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: quality === "high",
    powerPreference: "high-performance",
  });
} catch {
  bootLabel.textContent = "当前设备不支持 WebGL，请尝试更新浏览器";
  throw new Error("WebGL is unavailable");
}

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
camera.position.set(0, 0, 8);

const flower = new ParticleFlower({ quality });
const fingertipTrail = new FingertipTrail({ quality });
scene.add(flower.group);
scene.add(flower.handCursor.group);
scene.add(fingertipTrail.group);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  quality === "low" ? 0.3 : 0.36,
  0.48,
  0.62,
);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(outputPass);

const raycaster = new THREE.Raycaster();
const interactionPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const pointerNdc = new THREE.Vector2();
const handNdc = new THREE.Vector2();
const interactionNdc = new THREE.Vector2();
const pointerWorld = new THREE.Vector3();
const handWorldTarget = new THREE.Vector3();
const smoothHandWorld = new THREE.Vector3();
const previousTrailWorld = new THREE.Vector3();
const flowerCenterWorld = new THREE.Vector3();
const baseFlowerPosition = new THREE.Vector3();
const targetFlowerPosition = new THREE.Vector3();

let pointerActive = false;
let handData = { active: false, openness: 0.78, x: 0.5, y: 0.5 };
let cameraRunning = false;
let cameraHasTracking = false;
let smoothBloom = 0.78;
let textUpdateTime = 0;
let toastTimer = 0;
let hasShownTrackingToast = false;
let baseFlowerScale = 1;
let lastFrame = performance.now();
let elapsedTime = 0;
let trailSpeed = 0;
let hasTrailOrigin = false;

function showToast(message, duration = 4200) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, duration);
}

function setBusy(busy) {
  cameraButton.disabled = busy;
  cameraStartButton.disabled = busy;
  cameraButton.setAttribute("aria-busy", busy ? "true" : "false");
  cameraStartButton.setAttribute("aria-busy", busy ? "true" : "false");
}

function setCameraStatus(phase, message) {
  const previousCameraRunning = cameraRunning;
  cameraRunning = phase !== "stopped" && phase !== "error";

  if (phase === "loading") {
    setBusy(true);
    cameraButtonText.textContent = "请求权限中";
    statusText.textContent = "正在请求摄像头权限";
    liveStatus.classList.remove("is-tracking");
    liveStatus.classList.add("is-camera");
    return;
  }

  setBusy(false);

  if (phase === "camera-ready") {
    cameraHasTracking = false;
    cameraPanel.classList.add("is-active");
    cameraPanel.classList.remove("is-tracking");
    cameraButton.classList.add("is-active");
    cameraButtonText.textContent = "关闭摄像头";
    liveStatus.classList.add("is-camera");
    liveStatus.classList.remove("is-tracking");
    statusText.textContent = "摄像头已连接";
    previewGesture.textContent = "MODEL LOADING";
    confidenceValue.textContent = "CONF —";
    cameraFps.textContent = "CAM ON";
    return;
  }

  if (phase === "awaiting-hand" || phase === "tracking") {
    cameraPanel.classList.add("is-active");
    cameraButton.classList.add("is-active");
    cameraButtonText.textContent = "关闭手势";
    liveStatus.classList.add("is-camera");

    if (phase === "tracking") {
      cameraHasTracking = true;
      cameraPanel.classList.add("is-tracking");
      liveStatus.classList.add("is-tracking");
      statusText.textContent = "指尖感知中";
      if (!hasShownTrackingToast) {
        hasShownTrackingToast = true;
        showToast("已捕捉手部 · 握拳收拢，张开手掌");
      }
    } else {
      cameraHasTracking = false;
      cameraPanel.classList.remove("is-tracking");
      liveStatus.classList.remove("is-tracking");
      statusText.textContent = "等待手掌";
    }
    return;
  }

  if (phase === "model-error") {
    cameraHasTracking = false;
    cameraPanel.classList.add("is-active");
    cameraPanel.classList.remove("is-tracking");
    cameraButton.classList.add("is-active");
    cameraButtonText.textContent = "关闭摄像头";
    liveStatus.classList.add("is-camera");
    liveStatus.classList.remove("is-tracking");
    statusText.textContent = "识别模型加载失败";
    previewGesture.textContent = "MODEL OFFLINE";
    confidenceValue.textContent = "CONF —";
    cameraFps.textContent = "CAM ON";
    showToast(message || "摄像头已开启，但 MediaPipe 模型加载失败");
    return;
  }

  cameraPanel.classList.remove("is-active", "is-tracking");
  cameraButton.classList.remove("is-active");
  liveStatus.classList.remove("is-camera", "is-tracking");
  cameraVideo.style.opacity = "";

  if (phase === "error") {
    cameraButtonText.textContent = "重试手势";
    statusText.textContent = "摄像头未连接";
    previewGesture.textContent = "NO HAND";
    confidenceValue.textContent = "CONF —";
    cameraFps.textContent = "CAM OFF";
    showToast(message || "无法启动摄像头");
    return;
  }

  cameraButtonText.textContent = previousCameraRunning ? "启用手势" : "启用手势";
  statusText.textContent = "演示模式";
  previewGesture.textContent = "NO HAND";
  confidenceValue.textContent = "CONF —";
  cameraFps.textContent = "CAM OFF";
}

const tracker = new HandTracker({
  video: cameraVideo,
  canvas: landmarkCanvas,
  onFrame: (frame) => {
    handData = frame;
    if (frame.active) {
      handNdc.set(frame.x * 2 - 1, 1 - frame.y * 2);
      previewGesture.textContent = frame.gesture.split(" / ")[0];
      confidenceValue.textContent = `CONF ${Math.round((frame.confidence || 0) * 100)}`;
    } else {
      previewGesture.textContent = "NO HAND";
      confidenceValue.textContent = "CONF —";
    }
  },
  onState: ({ phase, message }) => {
    setCameraStatus(phase, message);
  },
  onFps: (fps) => {
    cameraFps.textContent = `CAM ${fps} FPS`;
  },
});

async function toggleCamera() {
  if (cameraButton.getAttribute("aria-busy") === "true") return;

  if (tracker.running || cameraRunning) {
    tracker.stop();
    handData = { active: false, openness: smoothBloom, x: 0.5, y: 0.5 };
    showToast("手势感知已暂停，花朵恢复呼吸模式", 2600);
    return;
  }

  await tracker.start();
}

cameraButton.addEventListener("click", toggleCamera);
cameraStartButton.addEventListener("click", toggleCamera);

canvas.addEventListener("pointermove", (event) => {
  if (cameraRunning) return;
  pointerNdc.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointerNdc.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  raycaster.ray.intersectPlane(interactionPlane, pointerWorld);
  pointerActive = true;
});

canvas.addEventListener("pointerleave", () => {
  pointerActive = false;
});

canvas.addEventListener("pointerdown", () => {
  pointerActive = true;
});

function worldPointFromHand() {
  raycaster.setFromCamera(handNdc, camera);
  raycaster.ray.intersectPlane(interactionPlane, handWorldTarget);
}

function layoutScene() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / height;
  const dpr = Math.min(
    window.devicePixelRatio || 1,
    quality === "low" ? 1.35 : 2,
  );
  const compact = width <= 800;

  camera.aspect = aspect;
  camera.position.z = 8;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);

  const visibleHeight =
    2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const visibleWidth = visibleHeight * aspect;

  if (compact) {
    baseFlowerScale = Math.min(0.76, (visibleWidth * 0.84) / 4.35);
    baseFlowerPosition.set(
      width < 560 ? 0 : visibleWidth * 0.045,
      -visibleHeight * 0.105,
      -0.15,
    );
  } else {
    baseFlowerScale = width < 1180 ? 0.84 : 0.94;
    baseFlowerPosition.set(
      visibleWidth * (aspect < 1.35 ? 0.175 : 0.205),
      aspect < 1.25 ? -visibleHeight * 0.035 : 0,
      -0.15,
    );
  }

  flower.group.position.copy(baseFlowerPosition);
  flower.group.scale.setScalar(baseFlowerScale);
  targetFlowerPosition.copy(baseFlowerPosition);
}

function updateUi(now) {
  if (now - textUpdateTime < 55) return;
  textUpdateTime = now;
  const bloomPercent = Math.round(smoothBloom * 100);
  bloomValue.textContent = String(bloomPercent);
  document.documentElement.style.setProperty(
    "--bloom",
    smoothBloom.toFixed(4),
  );

  if (handData.active) {
    gestureState.textContent = handData.gesture;
  } else if (cameraRunning) {
    gestureState.textContent = "AWAITING HAND";
  } else {
    gestureState.textContent = "BREATHING";
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  elapsedTime += delta;
  const time = reducedMotion ? 0 : elapsedTime;

  const handAvailable = Boolean(handData.active);
  const pointerAvailable = !cameraRunning && pointerActive;
  const interactionActive = handAvailable || pointerAvailable;

  if (handAvailable) {
    worldPointFromHand();
    interactionNdc.copy(handNdc);
  } else if (pointerAvailable) {
    handWorldTarget.copy(pointerWorld);
    interactionNdc.copy(pointerNdc);
  }

  if (interactionActive) {
    smoothHandWorld.lerp(
      handWorldTarget,
      1 - Math.exp(-delta * (handAvailable ? 16 : 10)),
    );
    flower.setHand(smoothHandWorld, true, {
      openness: handData.openness,
      colorX: interactionNdc.x,
      colorY: interactionNdc.y,
    });

    if (hasTrailOrigin) {
      const measuredSpeed =
        smoothHandWorld.distanceTo(previousTrailWorld) / Math.max(delta, 0.001);
      trailSpeed +=
        (measuredSpeed - trailSpeed) * (1 - Math.exp(-delta * 12));
    }
    previousTrailWorld.copy(smoothHandWorld);
    hasTrailOrigin = true;
  } else {
    trailSpeed *= Math.exp(-delta * 5);
    hasTrailOrigin = false;
    flower.setHand(null, false, {
      openness: 0.6,
      colorX: interactionNdc.x,
      colorY: interactionNdc.y,
    });
  }

  const idleWave =
    0.61 + (0.5 + 0.5 * Math.sin(time * 0.44 - 0.8)) * 0.31;
  const targetBloom = handAvailable
    ? handData.openness
    : pointerAvailable
      ? 0.7 + Math.sin(time * 0.38) * 0.11
      : idleWave;
  const responseRate =
    targetBloom > smoothBloom ? (handAvailable ? 7 : 2.4) : handAvailable ? 5.8 : 1.8;
  smoothBloom += (targetBloom - smoothBloom) * (1 - Math.exp(-delta * responseRate));
  smoothBloom = THREE.MathUtils.clamp(smoothBloom, 0, 1);

  targetFlowerPosition.copy(baseFlowerPosition);
  if (interactionActive) {
    targetFlowerPosition.x += handNdc.x * 0.075;
    targetFlowerPosition.y += handNdc.y * 0.055;
  }
  flower.group.position.lerp(
    targetFlowerPosition,
    1 - Math.exp(-delta * 2.5),
  );
  const openPose = THREE.MathUtils.smoothstep(smoothBloom, 0.46, 0.94);
  const handPose = handAvailable ? openPose : openPose * 0.72;
  const desiredTiltX =
    -0.115 -
    handPose * 0.365 +
    (interactionActive ? -handNdc.y * 0.025 : 0);
  const desiredTurnY =
    0.08 +
    Math.sin(time * 0.17) * 0.025 +
    (interactionActive ? handNdc.x * 0.055 : 0);
  flower.group.rotation.z =
    -0.055 + Math.sin(time * 0.22) * 0.014;
  flower.group.rotation.x +=
    (desiredTiltX - flower.group.rotation.x) *
    (1 - Math.exp(-delta * 3.1));
  flower.group.rotation.y +=
    (desiredTurnY - flower.group.rotation.y) *
    (1 - Math.exp(-delta * 3.1));

  const breathScale =
    baseFlowerScale *
    (1 +
      Math.sin(time * 0.55) * (reducedMotion ? 0 : 0.006) +
      (1 - openPose) * 0.035);
  flower.group.scale.setScalar(breathScale);
  flower.update({
    time,
    bloom: smoothBloom,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    delta,
  });
  flower.group.getWorldPosition(flowerCenterWorld);
  fingertipTrail.update({
    delta,
    time,
    origin: interactionActive ? smoothHandWorld : null,
    previousOrigin: previousTrailWorld,
    speed: trailSpeed,
    openness: smoothBloom,
    center: flowerCenterWorld,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    colorX: interactionNdc.x,
    colorY: interactionNdc.y,
  });
  bloomPass.strength =
    (quality === "low" ? 0.3 : 0.36) +
    smoothBloom * (quality === "low" ? 0.1 : 0.14);
  updateUi(now);

  composer.render(delta);
}

window.addEventListener("resize", layoutScene);

layoutScene();
requestAnimationFrame(animate);

requestAnimationFrame(() => {
  window.__flowerReady = true;
  window.clearTimeout(window.__flowerBootTimer);
  document.body.classList.add("is-ready");
  bootScreen.classList.add("is-hidden");
  app.setAttribute("aria-busy", "false");
});
