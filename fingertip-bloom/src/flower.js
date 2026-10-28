import * as THREE from "three";

const TAU = Math.PI * 2;
const NEON_PINK = new THREE.Color("#df4b80");
const NEON_CYAN = new THREE.Color("#3bbcc8");
const NEON_BLUE = new THREE.Color("#3857a8");
const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
const smoothstep = (min, max, value) => {
  const normalized = clamp((value - min) / (max - min));
  return normalized * normalized * (3 - 2 * normalized);
};

function createRandom(seed = 20261027) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 240, 212, 1)");
  gradient.addColorStop(0.08, "rgba(255, 205, 166, 0.92)");
  gradient.addColorStop(0.26, "rgba(255, 112, 107, 0.38)");
  gradient.addColorStop(0.58, "rgba(178, 48, 100, 0.1)");
  gradient.addColorStop(1, "rgba(80, 20, 54, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function buildPetalGeometry(quality, random) {
  const density = quality === "low" ? 0.48 : 1;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const layers = [
    {
      petals: 7,
      count: Math.round(12800 * density),
      reach: 2.08,
      root: 0.28,
      halfAngle: 0.44,
      depth: -0.23,
      curl: 0.12,
      cup: 0.24,
      arch: 0.13,
      thickness: 0.072,
      scatter: 0.028,
      twist: 0.045,
      angleOffset: 0,
      delay: 0,
      size: [0.072, 0.245],
    },
    {
      petals: 6,
      count: Math.round(9200 * density),
      reach: 1.56,
      root: 0.21,
      halfAngle: 0.48,
      depth: 0.04,
      curl: 0.28,
      cup: 0.27,
      arch: 0.15,
      thickness: 0.066,
      scatter: 0.024,
      twist: -0.035,
      angleOffset: goldenAngle * 1.25,
      delay: 0.07,
      size: [0.068, 0.235],
    },
    {
      petals: 5,
      count: Math.round(6600 * density),
      reach: 1.08,
      root: 0.14,
      halfAngle: 0.54,
      depth: 0.19,
      curl: 0.43,
      cup: 0.3,
      arch: 0.14,
      thickness: 0.058,
      scatter: 0.02,
      twist: 0.035,
      angleOffset: goldenAngle * 2.45,
      delay: 0.14,
      size: [0.065, 0.22],
    },
  ];

  const totalParticles = layers.reduce(
    (total, layer) => total + layer.count,
    0,
  );
  const positions = new Float32Array(totalParticles * 3);
  const budPositions = new Float32Array(totalParticles * 3);
  const colors = new Float32Array(totalParticles * 3);
  const sizes = new Float32Array(totalParticles);
  const rims = new Float32Array(totalParticles);
  const petalData = new Float32Array(totalParticles * 3);
  const phases = new Float32Array(totalParticles);
  const delays = new Float32Array(totalParticles);
  const color = new THREE.Color();
  const warmGold = new THREE.Color("#ffd6a0");
  const blush = new THREE.Color("#f8c9d4");
  const softPink = new THREE.Color("#e88eac");
  const petalRose = new THREE.Color("#c95380");
  const deepRose = new THREE.Color("#962a5b");
  let cursor = 0;

  layers.forEach((layer, layerIndex) => {
    const layerRatio = layerIndex / (layers.length - 1);
    const outerness = 1 - layerRatio;
    // Reserve part of every petal for a continuous double-sided outline.
    const outlineCount = Math.floor(
      layer.count * (layerIndex === 0 ? 0.3 : 0.27),
    );
    const outlinePerPetal = Math.max(
      4,
      Math.floor(outlineCount / layer.petals),
    );
    const outlinePerSide = Math.max(
      2,
      Math.floor(outlinePerPetal / 2),
    );

    for (let index = 0; index < layer.count; index += 1) {
      // Outline samples follow both petal edges; the rest fill the soft surface.
      const isOutline = index < outlinePerPetal * layer.petals;
      let petal;
      let along;
      let side;
      let sideSign;

      if (isOutline) {
        petal = Math.floor(index / outlinePerPetal);
        const outlineIndex = index - petal * outlinePerPetal;
        const outlineSide = outlineIndex % 2;
        const alongIndex = Math.floor(outlineIndex / 2);
        along = clamp(
          (alongIndex + 0.5 + (random() - 0.5) * 0.12) /
            outlinePerSide,
          0.012,
          0.996,
        );
        sideSign = outlineSide === 0 ? -1 : 1;
        side = sideSign * (0.945 + random() * 0.045);
      } else {
        // Three offset collars give the open flower a layered rose silhouette.
        petal = Math.floor(random() * layer.petals);
        along = clamp(0.025 + random() * 0.96);
        sideSign = random() < 0.5 ? -1 : 1;
        side = sideSign * Math.pow(random(), 1.06);
      }

      const petalCenter =
        layer.angleOffset +
        (petal / layer.petals) * TAU +
        layerIndex * goldenAngle * 0.42;
      // Keep the petal broad toward its rounded tip instead of tapering to a spike.
      const roundedWidth =
        smoothstep(0, 0.18, along) *
        Math.pow(Math.max(0, 1 - Math.pow(along, 2.7)), 0.48);
      const edge = Math.abs(side);
      const roundedSide = side * roundedWidth;
      const tip = smoothstep(0.7, 1, along);
      const spiralTwist =
        layer.twist * along * along +
        Math.sin((petal / layer.petals) * TAU) * 0.018 * along;
      const pointAngle =
        petalCenter +
        roundedSide * layer.halfAngle +
        spiralTwist;
      const radial =
        layer.root +
        (layer.reach - layer.root) *
          (0.78 * along + 0.22 * smoothstep(0, 1, along)) -
        // Pull the shoulders back so each petal ends in a soft, rounded arc.
        Math.pow(edge, 2) *
          smoothstep(0.7, 1, along) *
          0.085 *
          (0.86 + outerness * 0.14);
      const cupRise =
        layer.cup *
        Math.pow(edge, 1.9) *
        roundedWidth *
        (0.2 + along * 0.8);
      const petalArch =
        layer.arch * Math.sin(Math.PI * along);
      const petalCurl = layer.curl * along * along;
      const veinRidges =
        Math.sin(roundedSide * Math.PI * 4.2 + along * 1.4) *
        (1 - edge) *
        0.012 *
        roundedWidth;
      const gaussianA =
        (random() + random() + random() + random() - 2) *
        Math.sqrt(3);
      const gaussianB =
        (random() + random() + random() + random() - 2) *
        Math.sqrt(3);
      const gaussianC =
        (random() + random() + random() + random() - 2) *
        Math.sqrt(3);
      const stardust =
        layer.scatter *
        (0.1 + Math.pow(edge, 2.2) * 0.52 + tip * 0.3) *
        (isOutline ? 0.16 : 1);
      const petalRim = isOutline
        ? clamp(0.93 + tip * 0.07)
        : clamp(Math.pow(edge, 1.8) * 0.34 + tip * 0.27);
      const positionIndex = cursor * 3;
      positions[positionIndex] =
        Math.cos(pointAngle) * radial +
        Math.cos(pointAngle + Math.PI * 0.5) *
          roundedSide *
          layer.thickness *
          roundedWidth +
        gaussianA * stardust;
      positions[positionIndex + 1] =
        Math.sin(pointAngle) * radial +
        Math.sin(pointAngle + Math.PI * 0.5) *
          roundedSide *
          layer.thickness *
          roundedWidth +
        gaussianB * stardust;
      positions[positionIndex + 2] =
        layer.depth +
        petalCurl +
        petalArch +
        cupRise +
        veinRidges +
        gaussianC * stardust * 0.9 +
        gaussianA * layer.thickness * 0.45;

      // Closed petals wrap a tall vertical axis, making a layered rose bud.
      const budProfile = Math.sin(
        Math.PI * Math.pow(clamp(along * 0.94 + 0.03), 0.82),
      );
      const budTaper = 1 - smoothstep(0.66, 1, along) * 0.7;
      const budRadius =
        0.028 +
        budProfile *
          (0.205 + outerness * 0.04) *
          budTaper;
      const budAngle =
        petalCenter * 0.62 +
        layerIndex * goldenAngle * 0.92 +
        along * (0.34 + layerRatio * 0.14) +
        roundedSide * 0.12;
      budPositions[positionIndex] =
        Math.cos(budAngle) *
          (budRadius + outerness * 0.012) +
        Math.sin(along * 2.5 + layerIndex) * 0.006 +
        gaussianA * 0.009;
      budPositions[positionIndex + 1] =
        -0.9 +
        along * 1.76 +
        layerRatio * 0.035 +
        petalRim * 0.012 +
        gaussianB * 0.007;
      budPositions[positionIndex + 2] =
        Math.sin(budAngle) *
          (budRadius + outerness * 0.012) +
        Math.cos(along * 2.2 + layerIndex * 0.8) * 0.005 +
        gaussianC * 0.007;

      color
        .copy(deepRose)
        .lerp(
          petalRose,
          (1 - along) * 0.4 + layerRatio * 0.25,
        )
        .lerp(
          softPink,
          Math.pow(layerRatio, 1.4) * (0.36 + along * 0.28),
        )
        .lerp(
          blush,
          Math.pow(layerRatio, 2.2) *
            (0.18 + along * 0.34) +
            tip * (0.1 + layerRatio * 0.13),
        )
        .lerp(
          warmGold,
          Math.pow(layerRatio, 3.8) *
            Math.pow(1 - along, 1.7) *
            0.36,
        );
      color.lerp(deepRose, petalRim * outerness * 0.055);
      color.lerp(
        blush,
        petalRim * (isOutline ? 0.19 : 0.07 + layerRatio * 0.035),
      );
      color.offsetHSL(
        (random() - 0.5) * 0.016,
        (random() - 0.5) * 0.035,
        (random() - 0.5) * 0.04,
      );
      colors[positionIndex] = color.r;
      colors[positionIndex + 1] = color.g;
      colors[positionIndex + 2] = color.b;

      sizes[cursor] =
        THREE.MathUtils.lerp(
          layer.size[0],
          layer.size[1],
          Math.pow(random(), 1.8),
        ) *
        (isOutline ? 0.76 : 1 - petalRim * 0.14);
      rims[cursor] = petalRim;
      petalData[positionIndex] = petalCenter;
      petalData[positionIndex + 1] = side;
      petalData[positionIndex + 2] = layerRatio;
      phases[cursor] = random();
      delays[cursor] =
        layer.delay +
        (petal / layer.petals) * 0.012 +
        random() * 0.012;
      cursor += 1;
    }
  });

  return {
    positions,
    budPositions,
    colors,
    sizes,
    rims,
    petalData,
    phases,
    delays,
    count: totalParticles,
  };
}

function appendCoreParticles(
  particles,
  quality,
  random,
) {
  const coreCount = Math.round(quality === "low" ? 300 : 620);
  const total = particles.count + coreCount;
  const positions = new Float32Array(total * 3);
  const budPositions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const rims = new Float32Array(total);
  const petalData = new Float32Array(total * 3);
  const phases = new Float32Array(total);
  const delays = new Float32Array(total);

  positions.set(particles.positions);
  budPositions.set(particles.budPositions);
  colors.set(particles.colors);
  sizes.set(particles.sizes);
  rims.set(particles.rims);
  petalData.set(particles.petalData);
  phases.set(particles.phases);
  delays.set(particles.delays);

  const color = new THREE.Color();
  const white = new THREE.Color("#fffdf8");
  const warmGold = new THREE.Color("#ffe2a8");
  const warmPink = new THREE.Color("#fff0f5");
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let cursor = particles.count;

  for (let index = 0; index < coreCount; index += 1) {
    const positionIndex = cursor * 3;
    const angle = index * goldenAngle + random() * 0.22;
    const radius = Math.pow(random(), 1.45) * 0.235;
    const height = (random() - 0.5) * 0.1;

    positions[positionIndex] = Math.cos(angle) * radius;
    positions[positionIndex + 1] = Math.sin(angle) * radius;
    positions[positionIndex + 2] =
      0.43 + Math.cos(radius * 6.4) * 0.055 + height;
    const budRadius = Math.pow(random(), 1.6) * 0.08;
    budPositions[positionIndex] = Math.cos(angle) * budRadius;
    budPositions[positionIndex + 1] =
      -0.34 + random() * 0.92 + height * 0.2;
    budPositions[positionIndex + 2] =
      Math.sin(angle) * budRadius * 0.8;

    color
      .copy(white)
      .lerp(
        warmGold,
        Math.pow(random(), 1.5) * (0.24 + radius * 0.8),
      )
      .lerp(warmPink, random() * 0.2);
    colors[positionIndex] = color.r;
    colors[positionIndex + 1] = color.g;
    colors[positionIndex + 2] = color.b;

    sizes[cursor] = 0.07 + Math.pow(random(), 2.2) * 0.18;
    rims[cursor] = 0;
    phases[cursor] = random();
    delays[cursor] = 0.28 + random() * 0.08;
    cursor += 1;
  }

  return {
    positions,
    budPositions,
    colors,
    sizes,
    rims,
    petalData,
    phases,
    delays,
    count: total,
  };
}

function createBloomPoints(particles, uniforms) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(particles.positions, 3),
  );
  geometry.setAttribute(
    "aBudPosition",
    new THREE.BufferAttribute(particles.budPositions, 3),
  );
  geometry.setAttribute("aColor", new THREE.BufferAttribute(particles.colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(particles.sizes, 1));
  geometry.setAttribute("aRim", new THREE.BufferAttribute(particles.rims, 1));
  geometry.setAttribute(
    "aPetalData",
    new THREE.BufferAttribute(particles.petalData, 3),
  );
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(particles.phases, 1));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(particles.delays, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uBloom;
      uniform float uHandActive;
      uniform float uPixelRatio;
      uniform float uGestureOpen;
      uniform float uGestureFold;
      uniform vec3 uHand;

      attribute vec3 aBudPosition;
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aRim;
      attribute vec3 aPetalData;
      attribute float aPhase;
      attribute float aDelay;

      varying vec3 vColor;
      varying float vAlpha;
      varying float vHeat;
      varying float vRim;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        vec2 ease = local * local * (3.0 - 2.0 * local);
        float bottomLeft = hash21(cell);
        float bottomRight = hash21(cell + vec2(1.0, 0.0));
        float topLeft = hash21(cell + vec2(0.0, 1.0));
        float topRight = hash21(cell + vec2(1.0, 1.0));
        return mix(
          mix(bottomLeft, bottomRight, ease.x),
          mix(topLeft, topRight, ease.x),
          ease.y
        );
      }

      float fbm(vec2 point) {
        float value = 0.0;
        float amplitude = 0.54;
        mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
        for (int octave = 0; octave < 4; octave++) {
          value += valueNoise(point) * amplitude;
          point = turn * point * 2.03 + vec2(17.17, 9.31);
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        float delayedBloom = smoothstep(
          aDelay,
          min(0.96, aDelay + 0.54),
          uBloom
        );

        vec3 bloomPosition = position;
        float layeredFluff = fbm(
          position.xy * 2.2 +
          vec2(aPhase * 3.7, uTime * 0.07)
        );
        bloomPosition +=
          vec3(
            layeredFluff - 0.5,
            valueNoise(position.yz * 2.4 + aPhase) - 0.5,
            valueNoise(position.xz * 2.6 - aPhase) - 0.5
          ) *
          mix(0.005, 0.018, aRim) *
          delayedBloom;

        vec3 flowerPosition = mix(
          aBudPosition,
          bloomPosition,
          delayedBloom
        );

        // Coaxial petal collars lift and peel outward at different rates.
        float layerRatio = aPetalData.z;
        float outerness = 1.0 - layerRatio;
        float opening = smoothstep(0.24, 1.0, delayedBloom);
        float gestureOpening =
          uGestureOpen * uHandActive * opening;
        float layerOpening = smoothstep(
          layerRatio * 0.2,
          1.0,
          gestureOpening
        );
        vec2 petalRadial = vec2(cos(aPetalData.x), sin(aPetalData.x));
        vec2 petalTangent = vec2(-petalRadial.y, petalRadial.x);
        float localRadial = dot(flowerPosition.xy, petalRadial);
        float localTangent = dot(flowerPosition.xy, petalTangent);
        float hingeAngle =
          layerOpening *
          (0.16 + outerness * 0.44) *
          (0.72 + aRim * 0.28);
        float hingePivot = mix(0.1, 0.34, outerness);
        float radialLever = max(0.0, localRadial - hingePivot);
        localRadial -=
          radialLever * (1.0 - cos(hingeAngle)) * 0.58;
        localTangent *=
          1.0 + layerOpening * (0.008 + aRim * 0.028);
        flowerPosition.xy =
          petalRadial * localRadial +
          petalTangent * localTangent;
        flowerPosition.z +=
          radialLever *
            sin(hingeAngle) *
            (0.62 + outerness * 0.38) +
          aRim * aRim * outerness * 0.115 * layerOpening;

        vec2 handDelta = flowerPosition.xy - uHand.xy;
        float handDistance = length(handDelta);
        float handField =
          exp(-handDistance * handDistance * 0.72) * uHandActive;
        vec2 handDirection = normalize(handDelta + vec2(0.0001));
        float flowTime = uTime * 0.13;
        vec2 noisePosition =
          flowerPosition.xy * 1.36 +
          vec2(flowTime, -flowTime * 0.72);
        vec2 flow = vec2(
          fbm(noisePosition + vec2(aPhase * 5.1, 0.0)),
          fbm(noisePosition + vec2(9.7, aPhase * 4.3))
        ) - vec2(0.5);
        float fluff = fbm(
          noisePosition * 2.35 +
          vec2(-flowTime * 1.7, aPhase * 8.2)
        );
        float edgeSoftness = smoothstep(0.35, 0.95, aRim);
        flowerPosition.xy +=
          flow *
          (0.006 + handField * 0.034 + edgeSoftness * 0.012) *
          (0.7 + layerOpening * 0.3);
        flowerPosition.z +=
          (fluff - 0.5) *
          (0.009 + handField * 0.026 + edgeSoftness * 0.012);
        flowerPosition.xy +=
          handDirection *
          sin(handDistance * 4.6 - uTime * 1.5) *
          handField *
          0.012;
        flowerPosition.z +=
          sin(uTime * 0.78 + aPhase * 6.28318) *
          (0.004 + edgeSoftness * 0.008);

        float collapse = smoothstep(
          0.0,
          1.0,
          uGestureFold * uHandActive
        );
        flowerPosition = mix(
          flowerPosition,
          aBudPosition * 0.82,
          collapse
        );

        vec4 modelViewPosition = modelViewMatrix * vec4(flowerPosition, 1.0);
        gl_Position = projectionMatrix * modelViewPosition;

        float perspectiveScale = 24.0 / max(1.0, -modelViewPosition.z);
        gl_PointSize =
          aSize *
          uPixelRatio *
          perspectiveScale *
          1.06 *
          (1.0 + handField * 0.28) *
          (0.94 + delayedBloom * 0.08) *
          (1.0 + aRim * 0.08);

        float shimmer =
          0.9 +
          0.1 * sin(uTime * 1.35 + aPhase * 18.0 + delayedBloom * 3.0);
        float centerLift =
          1.0 - smoothstep(0.06, 0.48, length(flowerPosition.xy));
        vColor =
          aColor * (0.96 + delayedBloom * 0.08) +
          vec3(0.018, 0.005, 0.012) * centerLift;
        vColor += vec3(0.03, 0.005, 0.023) * aRim;
        vAlpha =
          shimmer *
          mix(0.82, 0.57, smoothstep(0.12, 0.98, aRim)) *
          (0.94 + centerLift * 0.08) *
          mix(1.0, 0.84, outerness * aRim);
        vHeat = handField;
        vRim = aRim;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vHeat;
      varying float vRim;

      void main() {
        vec2 point = gl_PointCoord - vec2(0.5);
        float distanceToCenter = length(point);
        if (distanceToCenter > 0.5) discard;

        float softDisc = 1.0 - smoothstep(0.07, 0.48, distanceToCenter);
        softDisc = pow(softDisc, 1.7);
        float pointCore = exp(-distanceToCenter * distanceToCenter * 36.0);
        float rimContrast = smoothstep(0.08, 0.96, vRim);
        vec3 color =
          vColor * (0.92 + pointCore * 0.07) +
          vec3(0.006, 0.001, 0.005) * vHeat;
        color +=
          vec3(0.017, 0.0025, 0.014) *
          rimContrast *
          pointCore;
        float alpha =
          softDisc *
          vAlpha *
          mix(1.0, 0.9, rimContrast);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function createStarDust(quality, uniforms, random) {
  const count = quality === "low" ? 120 : 240;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const angles = new Float32Array(count);
  const speeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const positionIndex = index * 3;
    radii[index] = 1.5 + Math.pow(random(), 0.7) * 2.2;
    angles[index] = random() * TAU;
    speeds[index] = (random() > 0.5 ? 1 : -1) * (0.018 + random() * 0.036);
    phases[index] = random();
    sizes[index] =
      random() > 0.9 ? 0.5 + random() * 0.55 : 0.18 + random() * 0.32;

    color
      .set(random() > 0.36 ? "#d8b7ef" : "#ff91ca")
      .lerp(new THREE.Color("#ffd7ec"), random() * 0.35)
      .multiplyScalar(0.32 + random() * 0.18);
    colors[positionIndex] = color.r;
    colors[positionIndex + 1] = color.g;
    colors[positionIndex + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aRadius", new THREE.BufferAttribute(radii, 1));
  geometry.setAttribute("aAngle", new THREE.BufferAttribute(angles, 1));
  geometry.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: uniforms.uTime,
      uPixelRatio: uniforms.uPixelRatio,
    },
    vertexShader: `
      uniform float uTime;
      uniform float uPixelRatio;

      attribute vec3 aColor;
      attribute float aRadius;
      attribute float aAngle;
      attribute float aSpeed;
      attribute float aSize;
      attribute float aPhase;

      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float angle = aAngle + uTime * aSpeed;
        vec3 animatedPosition = vec3(
          cos(angle) * aRadius,
          sin(angle) * aRadius * 0.58,
          sin(angle * 1.7 + aPhase * 6.28) * 0.65 - 0.35
        );
        vec4 modelViewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
        gl_Position = projectionMatrix * modelViewPosition;
        gl_PointSize =
          aSize *
          uPixelRatio *
          (22.0 / max(1.0, -modelViewPosition.z));

        float twinkle = 0.3 + 0.7 * pow(
          0.5 + 0.5 * sin(uTime * 1.1 + aPhase * 17.0),
          3.0
        );
        vColor = aColor;
        vAlpha = twinkle;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        float distanceToCenter = length(gl_PointCoord - vec2(0.5));
        if (distanceToCenter > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, distanceToCenter);
        glow = pow(glow, 2.3);
        gl_FragColor = vec4(vColor, glow * vAlpha * 0.055);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function createOrbitLine(radius, opacity, color) {
  const points = [];
  const count = 180;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TAU;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.62,
        -0.35,
      ),
    );
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return new THREE.LineLoop(geometry, material);
}

function createHandCursor(glowTexture) {
  const group = new THREE.Group();
  group.visible = false;

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: "#d9aa9a",
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const innerRingMaterial = ringMaterial.clone();
  innerRingMaterial.opacity = 0.12;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.165, 0.168, 64),
    ringMaterial,
  );
  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.082, 0.084, 48),
    innerRingMaterial,
  );
  innerRing.scale.setScalar(0.85);

  const dot = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: "#e6c0a3",
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  dot.scale.setScalar(0.42);

  group.add(ring, innerRing, dot);
  return { group, ring, innerRing, dot };
}

export class ParticleFlower {
  constructor({ quality = "high" } = {}) {
    this.random = createRandom();
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = "particle-flower";

    this.glowTexture = makeGlowTexture();
    this.uniforms = {
      uTime: { value: 0 },
      uBloom: { value: 0.78 },
      uPixelRatio: { value: 1 },
      uHand: { value: new THREE.Vector3(20, 20, 0) },
      uHandActive: { value: 0 },
      uGestureOpen: { value: 0 },
      uGestureFold: { value: 0 },
      uColorPoint: { value: new THREE.Vector2() },
    };
    this.openTarget = 0;
    this.foldTarget = 0;
    this.colorTarget = new THREE.Vector2();

    const petals = buildPetalGeometry(quality, this.random);
    const particles = appendCoreParticles(petals, quality, this.random);
    this.petalPoints = createBloomPoints(particles, this.uniforms);
    this.starDust = createStarDust(quality, this.uniforms, this.random);

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: "#e890bf",
        transparent: true,
        opacity: 0.0012,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.halo.position.z = -0.65;
    this.halo.scale.setScalar(5.2);

    this.coreGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: "#cbb0ee",
        transparent: true,
        opacity: 0.0018,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.coreGlow.position.z = 0.43;
    this.coreGlow.scale.setScalar(1.05);

    this.handCursor = createHandCursor(this.glowTexture);
    this.group.add(
      this.halo,
      this.starDust,
      this.petalPoints,
      this.coreGlow,
    );
  }

  setHand(
    worldPosition,
    active,
    { openness = 0.6, colorX = 0, colorY = 0 } = {},
  ) {
    this.uniforms.uHandActive.value = active ? 1 : 0;
    this.handCursor.group.visible = Boolean(active);
    this.openTarget = active ? smoothstep(0.48, 0.94, openness) : 0;
    this.foldTarget = active ? smoothstep(0.38, 0.04, openness) : 0;
    this.colorTarget.set(
      clamp(colorX, -1, 1),
      clamp(colorY, -1, 1),
    );

    if (!active || !worldPosition) {
      this.uniforms.uHand.value.set(20, 20, 0);
      return;
    }

    this.group.updateMatrixWorld();
    const localPosition = this.group.worldToLocal(worldPosition.clone());
    this.uniforms.uHand.value.copy(localPosition);
    this.handCursor.group.position.copy(worldPosition);
  }

  update({ time, bloom, pixelRatio, delta = 1 / 60 }) {
    this.uniforms.uTime.value = time;
    this.uniforms.uBloom.value = bloom;
    this.uniforms.uPixelRatio.value = pixelRatio;
    const unfoldBlend = 1 - Math.exp(-delta * 6.5);
    const collapseBlend = 1 - Math.exp(-delta * 10);
    this.uniforms.uGestureOpen.value = THREE.MathUtils.lerp(
      this.uniforms.uGestureOpen.value,
      this.openTarget,
      unfoldBlend,
    );
    this.uniforms.uGestureFold.value = THREE.MathUtils.lerp(
      this.uniforms.uGestureFold.value,
      this.foldTarget,
      collapseBlend,
    );
    this.uniforms.uColorPoint.value.lerp(
      this.colorTarget,
      1 - Math.exp(-delta * 4.2),
    );

    this.halo.material.opacity = 0.0008 + bloom * 0.0022;
    this.coreGlow.material.opacity = 0.0012 + bloom * 0.003;
    this.coreGlow.scale.setScalar(0.62 + bloom * 0.22);

    if (this.handCursor.group.visible) {
      const pulse = 1 + Math.sin(time * 2.2) * 0.08;
      this.handCursor.ring.scale.setScalar(pulse);
      this.handCursor.innerRing.scale.setScalar(0.85 + Math.sin(time * 1.7 + 1) * 0.12);
      this.handCursor.ring.rotation.z = time * 0.34;
      this.handCursor.innerRing.rotation.z = -time * 0.45;
    }
  }
}

export class FingertipTrail {
  constructor({ quality = "high" } = {}) {
    this.quality = quality;
    this.count = quality === "low" ? 680 : 1450;
    this.random = createRandom(731921);
    this.group = new THREE.Group();
    this.group.name = "fingertip-meteor-trail";
    this.group.frustumCulled = false;

    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.colors = new Float32Array(this.count * 3);
    this.sizes = new Float32Array(this.count);
    this.lives = new Float32Array(this.count);
    this.maxLives = new Float32Array(this.count);
    this.lifeRatios = new Float32Array(this.count);
    this.seeds = new Float32Array(this.count);
    this.cursor = 0;
    this.emissionAccumulator = 0;
    this.hasOrigin = false;
    this.previousOrigin = new THREE.Vector3();
    this.emitOrigin = new THREE.Vector3();
    this.emitDirection = new THREE.Vector3();
    this.emitColor = new THREE.Color();

    for (let index = 0; index < this.count; index += 1) {
      this.seeds[index] = this.random();
      this.positions[index * 3 + 2] = -100;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "aLife",
      new THREE.BufferAttribute(this.lifeRatios, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "aColor",
      new THREE.BufferAttribute(this.colors, 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(this.sizes, 1).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    geometry.setAttribute(
      "aSeed",
      new THREE.BufferAttribute(this.seeds, 1),
    );

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: 1 },
      },
      vertexShader: `
        uniform float uPixelRatio;

        attribute float aLife;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aSeed;

        varying vec3 vColor;
        varying float vAlpha;
        varying float vSeed;

        void main() {
          if (aLife <= 0.001) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            vColor = aColor;
            vAlpha = 0.0;
            vSeed = aSeed;
            return;
          }

          vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * modelViewPosition;
          float fade = smoothstep(0.0, 0.18, aLife) * pow(aLife, 0.72);
          gl_PointSize =
            aSize *
            uPixelRatio *
            (34.0 / max(1.0, -modelViewPosition.z)) *
            (0.24 + aLife * 0.92);
          vColor = aColor;
          vAlpha = fade;
          vSeed = aSeed;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vSeed;

        void main() {
          if (vAlpha <= 0.004) discard;

          vec2 point = gl_PointCoord - vec2(0.5);
          float distanceToCenter = length(point);
          if (distanceToCenter > 0.5) discard;

          float glow = pow(smoothstep(0.5, 0.0, distanceToCenter), 2.8);
          float core = smoothstep(0.16, 0.0, distanceToCenter);
          float sparkle = 0.82 + 0.18 * sin(vSeed * 71.0);
          vec3 color = vColor * (0.78 + core * 0.54);
          gl_FragColor = vec4(
            color * sparkle,
            glow * vAlpha * (0.56 + core * 0.3)
          );
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  emitParticle(origin, direction, speedFactor, openness, colorX, colorY) {
    const index = this.cursor;
    const positionIndex = index * 3;
    const random = this.random;
    const spread = Math.max(0, (openness - 0.48) * 1.8);
    const driftAngle = random() * TAU;
    const trailBack = 0.82 + speedFactor * 2.8;

    this.emitOrigin.lerpVectors(this.previousOrigin, origin, random());
    const sideJitter = (random() - 0.5) * (0.025 + speedFactor * 0.035);
    this.positions[positionIndex] =
      this.emitOrigin.x - direction.y * sideJitter +
      Math.cos(driftAngle) * spread * random() * 0.045;
    this.positions[positionIndex + 1] =
      this.emitOrigin.y + direction.x * sideJitter +
      Math.sin(driftAngle) * spread * random() * 0.045;
    this.positions[positionIndex + 2] =
      this.emitOrigin.z + (random() - 0.5) * 0.035;

    this.velocities[positionIndex] =
      -direction.x * trailBack +
      Math.cos(driftAngle) * spread * (0.45 + random() * 1.35);
    this.velocities[positionIndex + 1] =
      -direction.y * trailBack +
      Math.sin(driftAngle) * spread * (0.45 + random() * 1.35);
    this.velocities[positionIndex + 2] =
      (random() - 0.5) * (0.18 + spread * 0.65);

    const colorCoordinate = clamp(
      0.5 + colorX * 0.38 - colorY * 0.28 + (random() - 0.5) * 0.14,
    );
    this.emitColor
      .copy(NEON_PINK)
      .lerp(NEON_CYAN, THREE.MathUtils.smoothstep(colorCoordinate, 0, 0.82));
    this.emitColor.lerp(
      NEON_BLUE,
      THREE.MathUtils.smoothstep(colorCoordinate, 0.78, 1) * 0.34,
    );
    this.emitColor.multiplyScalar(0.82 + random() * 0.32);
    this.colors[positionIndex] = this.emitColor.r;
    this.colors[positionIndex + 1] = this.emitColor.g;
    this.colors[positionIndex + 2] = this.emitColor.b;

    this.sizes[index] =
      (0.24 + random() * 0.58) * (0.82 + speedFactor * 0.48);
    this.maxLives[index] =
      THREE.MathUtils.lerp(0.24, 0.94, speedFactor) *
      (0.82 + random() * 0.38);
    this.lives[index] = this.maxLives[index];
    this.lifeRatios[index] = 1;
    this.cursor = (this.cursor + 1) % this.count;
  }

  update({
    delta,
    origin,
    speed,
    openness,
    center,
    pixelRatio,
    colorX,
    colorY,
  }) {
    const dt = clamp(delta, 0, 0.05);
    const active = Boolean(origin);
    const speedFactor = clamp((speed - 0.18) / 7.5);
    const blow = active ? smoothstep(0.52, 0.95, openness) : 0;
    const collapse = active ? smoothstep(0.38, 0.04, openness) : 0;
    const damping = Math.exp(-dt * (1.8 + blow * 0.45 + collapse * 1.3));

    if (active && this.hasOrigin) {
      this.emitDirection.subVectors(origin, this.previousOrigin);
      if (this.emitDirection.lengthSq() > 0.000001) {
        const rate =
          THREE.MathUtils.lerp(18, this.quality === "low" ? 230 : 330, speedFactor);
        this.emissionAccumulator += dt * rate;
        const direction = this.emitDirection.clone().normalize();
        while (this.emissionAccumulator >= 1) {
          this.emitParticle(
            origin,
            direction,
            speedFactor,
            openness,
            colorX,
            colorY,
          );
          this.emissionAccumulator -= 1;
        }
      } else {
        this.emissionAccumulator = 0;
      }
    } else {
      this.emissionAccumulator = 0;
    }

    for (let index = 0; index < this.count; index += 1) {
      if (this.lives[index] <= 0) continue;

      const positionIndex = index * 3;
      this.lives[index] = Math.max(0, this.lives[index] - dt);
      this.lifeRatios[index] =
        this.lives[index] / Math.max(0.001, this.maxLives[index]);

      if (active && (blow > 0.001 || collapse > 0.001)) {
        let deltaX = 0;
        let deltaY = 0;
        if (blow > 0.001) {
          deltaX = this.positions[positionIndex] - origin.x;
          deltaY = this.positions[positionIndex + 1] - origin.y;
        } else {
          deltaX = center.x - this.positions[positionIndex];
          deltaY = center.y - this.positions[positionIndex + 1];
        }
        const distance = Math.max(0.001, Math.hypot(deltaX, deltaY));
        const force = blow * 4.4 + collapse * 15.5;
        this.velocities[positionIndex] +=
          (deltaX / distance) * force * dt +
          (blow > 0.001 ? (-deltaY / distance) * blow * 2.2 * dt : 0);
        this.velocities[positionIndex + 1] +=
          (deltaY / distance) * force * dt +
          (blow > 0.001 ? (deltaX / distance) * blow * 2.2 * dt : 0);
        this.velocities[positionIndex + 2] +=
          (blow > 0.001 ? (this.random() - 0.5) * blow * 2.5 * dt : 0);
      }

      this.velocities[positionIndex] *= damping;
      this.velocities[positionIndex + 1] *= damping;
      this.velocities[positionIndex + 2] *= damping;
      this.positions[positionIndex] += this.velocities[positionIndex] * dt;
      this.positions[positionIndex + 1] +=
        this.velocities[positionIndex + 1] * dt;
      this.positions[positionIndex + 2] +=
        this.velocities[positionIndex + 2] * dt;
    }

    if (active) {
      this.previousOrigin.copy(origin);
      this.hasOrigin = true;
    } else {
      this.hasOrigin = false;
    }

    this.points.material.uniforms.uPixelRatio.value = pixelRatio;
    const attributes = this.points.geometry.attributes;
    attributes.position.needsUpdate = true;
    attributes.aLife.needsUpdate = true;
    attributes.aColor.needsUpdate = true;
    attributes.aSize.needsUpdate = true;
  }
}
