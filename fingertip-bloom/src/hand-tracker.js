const MEDIAPIPE_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/";

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

const FINGERS = [
  [5, 8],
  [9, 12],
  [13, 16],
  [17, 20],
];

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const smoothstep = (min, max, value) => {
  const normalized = clamp((value - min) / (max - min));
  return normalized * normalized * (3 - 2 * normalized);
};

const distance2D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function getGestureLabel(openness) {
  if (openness > 0.72) return "BLOOM / 绽放";
  if (openness > 0.43) return "UNFURL / 舒展";
  if (openness > 0.16) return "FOLD / 收拢";
  return "BUD / 花苞";
}

function calculateGesture(landmarks) {
  const wrist = landmarks[0];
  const palmAnchor = landmarks[9];
  const palmLength = Math.max(distance2D(wrist, palmAnchor), 0.025);

  const extensionRatios = FINGERS.map(([joint, tip]) => {
    const jointDistance = Math.max(distance2D(wrist, landmarks[joint]), 0.015);
    return distance2D(wrist, landmarks[tip]) / jointDistance;
  });

  const averageExtension =
    extensionRatios.reduce((total, ratio) => total + ratio, 0) /
    extensionRatios.length;
  const fingerSpread = distance2D(landmarks[4], landmarks[20]) / palmLength;
  const extensionScore = smoothstep(1.16, 2.24, averageExtension);
  const spreadScore = smoothstep(0.52, 1.3, fingerSpread);
  const raisedFingers = extensionRatios.filter((ratio) => ratio > 1.54).length;
  const thumbScore = smoothstep(0.5, 1.05, distance2D(landmarks[4], landmarks[17]) / palmLength);

  const sampleOpenness = clamp(extensionScore * 0.76 + spreadScore * 0.16 + thumbScore * 0.08);
  const palmIndices = [0, 5, 9, 13, 17];
  const palmCenter = palmIndices.reduce(
    (center, index) => ({
      x: center.x + landmarks[index].x / palmIndices.length,
      y: center.y + landmarks[index].y / palmIndices.length,
    }),
    { x: 0, y: 0 },
  );
  const indexTip = landmarks[8];

  return {
    openness: sampleOpenness,
    raisedFingers,
    palmCenter,
    indexTip,
    scoreBreakdown: {
      extension: extensionScore,
      spread: spreadScore,
      thumb: thumbScore,
    },
  };
}

export class HandTracker {
  constructor({
    video,
    canvas,
    onFrame,
    onState,
    onFps,
  }) {
    this.video = video;
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.onFrame = onFrame;
    this.onState = onState;
    this.onFps = onFps;

    this.hands = null;
    this.stream = null;
    this.running = false;
    this.busy = false;
    this.frameHandle = 0;
    this.lastFrameTime = 0;
    this.lastLandmarkTime = 0;
    this.latestLandmarks = null;
    this.resultCount = 0;
    this.fpsWindowStart = 0;
    this.sessionId = 0;
  }

  async start() {
    if (this.running) return;

    const sessionId = ++this.sessionId;
    this.onState?.({ phase: "loading", message: "正在请求摄像头权限" });

    if (!navigator.mediaDevices?.getUserMedia) {
      this.onState?.({
        phase: "error",
        message: "当前浏览器不支持摄像头访问，请使用 Chrome 或 Edge",
      });
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });

      if (sessionId !== this.sessionId) {
        this.stop();
        return;
      }

      this.video.srcObject = this.stream;
      await this.video.play();

      this.onState?.({
        phase: "camera-ready",
        message: "摄像头已连接，正在加载识别模型",
      });

      if (typeof window.Hands !== "function") {
        this.onState?.({
          phase: "model-error",
          message: "摄像头已开启，但 MediaPipe 模型加载失败，请检查网络后刷新",
        });
        return;
      }

      this.hands = new window.Hands({
        locateFile: (file) => `${MEDIAPIPE_BASE}${file}`,
      });

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.62,
        minTrackingConfidence: 0.58,
      });

      this.hands.onResults((results) => this.handleResults(results));

      this.running = true;
      this.fpsWindowStart = performance.now();
      this.resultCount = 0;
      this.onState?.({ phase: "awaiting-hand", message: "将手掌置于镜头前" });
      this.pump();
    } catch (error) {
      this.releaseResources();
      const permissionDenied =
        error?.name === "NotAllowedError" || error?.name === "SecurityError";
      this.onState?.({
        phase: "error",
        message: permissionDenied
          ? "摄像头权限被拒绝，请在地址栏中允许访问后重试"
          : "无法启动摄像头，请确认设备未被其他应用占用",
      });
    }
  }

  stop() {
    this.sessionId += 1;
    this.running = false;
    this.busy = false;
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.releaseResources();
    this.clearCanvas();
    this.latestLandmarks = null;
    this.onFrame?.({ active: false, fps: 0 });
    this.onState?.({ phase: "stopped", message: "手势已暂停" });
  }

  releaseResources() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;

    if (this.hands) {
      try {
        this.hands.close();
      } catch {
        // MediaPipe may already have disposed its wasm worker.
      }
    }
    this.hands = null;
  }

  async pump() {
    if (!this.running) return;

    const now = performance.now();
    const frameInterval = 1000 / 24;

    if (
      this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      !this.busy &&
      now - this.lastFrameTime >= frameInterval
    ) {
      this.busy = true;
      this.lastFrameTime = now;

      try {
        await this.hands.send({ image: this.video });
      } catch {
        if (this.running) {
          this.running = false;
          cancelAnimationFrame(this.frameHandle);
          this.frameHandle = 0;
          this.latestLandmarks = null;
          this.clearCanvas();

          try {
            this.hands?.close();
          } catch {
            // Preserve the camera stream when MediaPipe fails to start.
          }
          this.hands = null;

          this.onFrame?.({ active: false, fps: 0 });
          this.onState?.({
            phase: "model-error",
            message: "摄像头已开启，但视觉模型运行失败，请检查网络后刷新",
          });
          return;
        }
      } finally {
        this.busy = false;
      }
    }

    if (this.running) {
      this.frameHandle = requestAnimationFrame(() => this.pump());
    }
  }

  handleResults(results) {
    if (!this.running) return;

    const now = performance.now();
    const landmarks = results.multiHandLandmarks?.[0];
    const handedness = results.multiHandedness?.[0];

    this.resultCount += 1;
    if (now - this.fpsWindowStart >= 1000) {
      const elapsed = (now - this.fpsWindowStart) / 1000;
      this.onFps?.(Math.round(this.resultCount / elapsed));
      this.resultCount = 0;
      this.fpsWindowStart = now;
    }

    if (!landmarks) {
      if (
        this.latestLandmarks &&
        now - this.lastLandmarkTime < 320
      ) {
        return;
      }

      this.latestLandmarks = null;
      this.clearCanvas();
      this.onFrame?.({ active: false, fps: 0 });
      this.onState?.({ phase: "awaiting-hand", message: "将手掌置于镜头前" });
      return;
    }

    const gesture = calculateGesture(landmarks);
    const confidence = handedness?.score ?? 0.8;
    const mirroredX = 1 - gesture.indexTip.x;
    const palmX = 1 - gesture.palmCenter.x;

    this.latestLandmarks = landmarks;
    this.lastLandmarkTime = now;

    this.drawLandmarks(landmarks);
    this.onFrame?.({
      active: true,
      openness: gesture.openness,
      x: mirroredX,
      y: gesture.indexTip.y,
      palmX,
      palmY: gesture.palmCenter.y,
      confidence,
      gesture: getGestureLabel(gesture.openness),
      raisedFingers: gesture.raisedFingers,
      fps: 0,
    });
    this.onState?.({ phase: "tracking", message: "手势追踪中" });
  }

  drawLandmarks(landmarks) {
    if (!landmarks) return;

    const { width, height } = this.canvas;
    const context = this.context;
    context.clearRect(0, 0, width, height);

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 1.35;
    context.strokeStyle = "rgba(255, 181, 158, 0.58)";
    context.beginPath();
    for (const [from, to] of HAND_CONNECTIONS) {
      context.moveTo(landmarks[from].x * width, landmarks[from].y * height);
      context.lineTo(landmarks[to].x * width, landmarks[to].y * height);
    }
    context.stroke();

    for (let index = 0; index < landmarks.length; index += 1) {
      const point = landmarks[index];
      const isTip = [4, 8, 12, 16, 20].includes(index);
      const radius = isTip ? 3.3 : 1.9;

      context.beginPath();
      context.arc(
        point.x * width,
        point.y * height,
        radius + 2.2,
        0,
        Math.PI * 2,
      );
      context.fillStyle = isTip
        ? "rgba(255, 103, 108, 0.18)"
        : "rgba(167, 224, 204, 0.12)";
      context.fill();

      context.beginPath();
      context.arc(
        point.x * width,
        point.y * height,
        radius,
        0,
        Math.PI * 2,
      );
      context.fillStyle = isTip
        ? "rgba(255, 224, 204, 0.95)"
        : "rgba(205, 239, 225, 0.78)";
      context.fill();
    }
  }

  clearCanvas() {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
