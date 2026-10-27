/**
 * Visualizer3D: State-of-the-Art WebGL 3D Audio-Reactive Scene Engine
 * Uses Three.js with custom particle fields, audio-reactive vertex displacement,
 * dynamic color themes, mouse parallax, and interactive 3D camera orbit.
 */
class Visualizer3D {
  constructor(canvasContainerId) {
    this.container = document.getElementById(canvasContainerId);
    if (!this.container) {
      console.error(`Container #${canvasContainerId} not found.`);
      return;
    }

    // Three.js Core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.timer = null;
    this.animationFrameId = null;

    // Visualizer modes: 'core' (Sphere & Halos), 'wave' (Terrain Grid), 'vortex' (Particle Swarm)
    this.currentMode = 'core';
    this.currentTheme = 'cyan'; // 'cyan' | 'synthwave' | 'emerald' | 'solar'

    // Scene Groups
    this.activeGroup = null;
    this.stardustPoints = null;

    // Color definitions
    this.themes = {
      cyan: {
        primary: 0x06b6d4,
        secondary: 0x3b82f6,
        accent: 0xa855f7,
        bgLight: 0x0f172a,
        emissive: 0x0891b2
      },
      synthwave: {
        primary: 0xd946ef,
        secondary: 0x8b5cf6,
        accent: 0x06b6d4,
        bgLight: 0x2e1065,
        emissive: 0xa21caf
      },
      emerald: {
        primary: 0x10b981,
        secondary: 0x06b6d4,
        accent: 0xfacc15,
        bgLight: 0x064e3b,
        emissive: 0x059669
      },
      solar: {
        primary: 0xf59e0b,
        secondary: 0xef4444,
        accent: 0xec4899,
        bgLight: 0x451a03,
        emissive: 0xd97706
      }
    };

    // Parallax & Camera Controls
    this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.orbitRotation = { x: 0, y: 0 };

    // Audio Modulator Reference
    this.audioModulator = null;

    this._init();
  }

  _init() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030712, 0.035);

    // 2. Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 8.5);

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;

    // Canvas DOM
    this.renderer.domElement.id = 'threejs-canvas';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.zIndex = '0';
    this.container.appendChild(this.renderer.domElement);

    // 4. Timer / Clock (supports modern THREE.Timer or fallback to THREE.Clock)
    if (typeof THREE.Timer !== 'undefined') {
      this.timer = new THREE.Timer();
    } else {
      this.timer = new THREE.Clock();
    }

    // 5. Lighting
    this._setupLights();

    // 6. Global Ambient Stardust (Background Cosmos)
    this._createCosmicStardust();

    // 7. Build default mode
    this._buildMode(this.currentMode);

    // 8. Event Listeners
    this._setupEventListeners();

    // 9. Start Render Loop
    this._animate();
  }

  _setupLights() {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(this.ambientLight);

    this.pointLight1 = new THREE.PointLight(this.themes[this.currentTheme].primary, 3.5, 40);
    this.pointLight1.position.set(6, 6, 8);
    this.scene.add(this.pointLight1);

    this.pointLight2 = new THREE.PointLight(this.themes[this.currentTheme].secondary, 3.0, 40);
    this.pointLight2.position.set(-7, -5, -4);
    this.scene.add(this.pointLight2);
  }

  setAudioModulator(modulator) {
    this.audioModulator = modulator;
  }

  /**
   * Universal Background Stardust Particles
   */
  _createCosmicStardust() {
    const starCount = 1800;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const themeColors = this.themes[this.currentTheme];
    const c1 = new THREE.Color(themeColors.primary);
    const c2 = new THREE.Color(themeColors.secondary);

    for (let i = 0; i < starCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 45;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 45;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 45;

      const mixed = Math.random() > 0.5 ? c1 : c2;
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.06,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });

    this.stardustPoints = new THREE.Points(geometry, material);
    this.scene.add(this.stardustPoints);
  }

  /**
   * Mode 1: Cyber Neural Core (Deforming Icosahedron + Concentric Orbital Rings)
   */
  _createModeCore() {
    const group = new THREE.Group();
    const theme = this.themes[this.currentTheme];

    // 1. Central Morphing Icosahedron Mesh
    const sphereRadius = 2.1;
    const sphereDetail = 26; // High density vertex grid for smooth audio waves
    const geometry = new THREE.IcosahedronGeometry(sphereRadius, sphereDetail);

    // Store base vertex positions for audio deformation
    const posAttr = geometry.attributes.position;
    const basePositions = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count * 3; i++) {
      basePositions[i] = posAttr.array[i];
    }
    geometry.userData = { basePositions: basePositions, originalRadius: sphereRadius };

    // Outer Translucent Physical Shell
    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: theme.bgLight,
      emissive: theme.emissive,
      emissiveIntensity: 0.5,
      roughness: 0.25,
      metalness: 0.85,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      wireframe: false,
      transparent: true,
      opacity: 0.82
    });

    const coreMesh = new THREE.Mesh(geometry, coreMaterial);
    group.add(coreMesh);
    group.userData.coreMesh = coreMesh;

    // Glowing Wireframe Overlay
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: theme.primary,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending
    });
    const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
    wireframeMesh.scale.setScalar(1.002);
    group.add(wireframeMesh);
    group.userData.wireframeMesh = wireframeMesh;

    // 2. Orbital Particle Halo 1 (Horizontal Inclined Ring)
    const halo1Count = 2800;
    const halo1Geo = new THREE.BufferGeometry();
    const halo1Pos = new Float32Array(halo1Count * 3);
    const halo1Colors = new Float32Array(halo1Count * 3);
    const colorPrim = new THREE.Color(theme.primary);
    const colorSec = new THREE.Color(theme.secondary);

    for (let i = 0; i < halo1Count; i++) {
      const angle = (i / halo1Count) * Math.PI * 2;
      const radius = 3.6 + (Math.random() - 0.5) * 0.7;
      const spreadY = (Math.random() - 0.5) * 0.4;

      halo1Pos[i * 3] = Math.cos(angle) * radius;
      halo1Pos[i * 3 + 1] = spreadY;
      halo1Pos[i * 3 + 2] = Math.sin(angle) * radius;

      const c = i % 2 === 0 ? colorPrim : colorSec;
      halo1Colors[i * 3] = c.r;
      halo1Colors[i * 3 + 1] = c.g;
      halo1Colors[i * 3 + 2] = c.b;
    }
    halo1Geo.setAttribute('position', new THREE.BufferAttribute(halo1Pos, 3));
    halo1Geo.setAttribute('color', new THREE.BufferAttribute(halo1Colors, 3));

    const halo1Mat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    const halo1Points = new THREE.Points(halo1Geo, halo1Mat);
    halo1Points.rotation.x = Math.PI * 0.28;
    halo1Points.rotation.z = Math.PI * 0.12;
    group.add(halo1Points);
    group.userData.halo1 = halo1Points;

    // 3. Orbital Particle Halo 2 (Vertical Cross Ring)
    const halo2Count = 1800;
    const halo2Geo = new THREE.BufferGeometry();
    const halo2Pos = new Float32Array(halo2Count * 3);
    const halo2Colors = new Float32Array(halo2Count * 3);
    const colorAcc = new THREE.Color(theme.accent);

    for (let i = 0; i < halo2Count; i++) {
      const angle = (i / halo2Count) * Math.PI * 2;
      const radius = 4.4 + (Math.random() - 0.5) * 0.8;
      const spreadX = (Math.random() - 0.5) * 0.5;

      halo2Pos[i * 3] = spreadX;
      halo2Pos[i * 3 + 1] = Math.cos(angle) * radius;
      halo2Pos[i * 3 + 2] = Math.sin(angle) * radius;

      const c = i % 3 === 0 ? colorAcc : colorPrim;
      halo2Colors[i * 3] = c.r;
      halo2Colors[i * 3 + 1] = c.g;
      halo2Colors[i * 3 + 2] = c.b;
    }
    halo2Geo.setAttribute('position', new THREE.BufferAttribute(halo2Pos, 3));
    halo2Geo.setAttribute('color', new THREE.BufferAttribute(halo2Colors, 3));

    const halo2Mat = new THREE.PointsMaterial({
      size: 0.065,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    const halo2Points = new THREE.Points(halo2Geo, halo2Mat);
    halo2Points.rotation.y = Math.PI * 0.35;
    group.add(halo2Points);
    group.userData.halo2 = halo2Points;

    return group;
  }

  /**
   * Mode 2: Cyber Waveform Grid (Undulating 3D Matrix Landscape)
   */
  _createModeWave() {
    const group = new THREE.Group();
    const theme = this.themes[this.currentTheme];

    const planeW = 38;
    const planeH = 38;
    const segsW = 64;
    const segsH = 64;
    const planeGeo = new THREE.PlaneGeometry(planeW, planeH, segsW, segsH);
    planeGeo.rotateX(-Math.PI * 0.42);

    // Save baseline coords
    const pos = planeGeo.attributes.position;
    const basePositions = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count * 3; i++) {
      basePositions[i] = pos.array[i];
    }
    planeGeo.userData = { basePositions };

    // Point Matrix
    const pointMat = new THREE.PointsMaterial({
      color: theme.primary,
      size: 0.08,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const pointGrid = new THREE.Points(planeGeo, pointMat);
    group.add(pointGrid);
    group.userData.pointGrid = pointGrid;

    // Glowing Wireframe Lines
    const wireMat = new THREE.MeshBasicMaterial({
      color: theme.secondary,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending
    });
    const wireMesh = new THREE.Mesh(planeGeo, wireMat);
    group.add(wireMesh);
    group.userData.wireMesh = wireMesh;

    group.position.set(0, -1.8, -1.5);
    return group;
  }

  /**
   * Mode 3: Quantum Vortex Nebula (10,000 Spiral Particle Swarm)
   */
  _createModeVortex() {
    const group = new THREE.Group();
    const theme = this.themes[this.currentTheme];

    const particleCount = 9000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);

    const c1 = new THREE.Color(theme.primary);
    const c2 = new THREE.Color(theme.secondary);
    const c3 = new THREE.Color(theme.accent);

    for (let i = 0; i < particleCount; i++) {
      const arm = i % 4;
      const angle = (i / particleCount) * Math.PI * 18 + (arm * (Math.PI / 2));
      const dist = Math.pow(Math.random(), 0.6) * 7.5 + 0.5;
      const spreadZ = (Math.random() - 0.5) * (dist * 0.5);

      const x = Math.cos(angle) * dist;
      const y = (Math.random() - 0.5) * 0.8;
      const z = Math.sin(angle) * dist + spreadZ;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      originalPositions[i * 3] = x;
      originalPositions[i * 3 + 1] = y;
      originalPositions[i * 3 + 2] = z;

      let chosenColor = c1;
      if (dist > 4.5) chosenColor = c3;
      else if (dist > 2.5) chosenColor = c2;

      colors[i * 3] = chosenColor.r;
      colors[i * 3 + 1] = chosenColor.g;
      colors[i * 3 + 2] = chosenColor.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.userData = { originalPositions };

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geo, mat);
    group.add(points);
    group.userData.vortexPoints = points;

    return group;
  }

  _buildMode(modeName) {
    if (this.activeGroup) {
      this._disposeGroup(this.activeGroup);
      this.scene.remove(this.activeGroup);
    }

    this.currentMode = modeName;
    if (modeName === 'core') {
      this.activeGroup = this._createModeCore();
    } else if (modeName === 'wave') {
      this.activeGroup = this._createModeWave();
    } else if (modeName === 'vortex') {
      this.activeGroup = this._createModeVortex();
    }

    if (this.activeGroup) {
      this.scene.add(this.activeGroup);
    }
  }

  setMode(modeName) {
    if (this.currentMode === modeName) return;
    this._buildMode(modeName);
  }

  setTheme(themeName) {
    if (!this.themes[themeName]) return;
    this.currentTheme = themeName;
    const t = this.themes[themeName];

    // Update lights
    if (this.pointLight1) this.pointLight1.color.setHex(t.primary);
    if (this.pointLight2) this.pointLight2.color.setHex(t.secondary);

    // Rebuild active mode with new theme colors
    this._buildMode(this.currentMode);
  }

  _setupEventListeners() {
    // Window resize
    window.addEventListener('resize', this._onWindowResize.bind(this));

    // Mouse parallax
    window.addEventListener('mousemove', (e) => {
      this.mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      this.mouse.targetY = -(e.clientY / window.innerHeight - 0.5) * 2;

      // Handle interactive drag rotation
      if (this.isDragging && this.activeGroup) {
        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        this.orbitRotation.y += deltaX * 0.005;
        this.orbitRotation.x += deltaY * 0.005;

        this.previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    });

    // Drag to orbit canvas interaction
    window.addEventListener('mousedown', (e) => {
      // Only drag if clicking on canvas or background (not on interactive UI inputs)
      if (e.target.closest('#speech-panel') || e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) {
        return;
      }
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Touch support for mobile parallax & orbit
    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        this.mouse.targetX = (touch.clientX / window.innerWidth - 0.5) * 2;
        this.mouse.targetY = -(touch.clientY / window.innerHeight - 0.5) * 2;
      }
    }, { passive: true });
  }

  _onWindowResize() {
    if (!this.camera || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  /**
   * Main Animation Loop (High Performance 60-120fps)
   */
  _animate() {
    this.animationFrameId = requestAnimationFrame(this._animate.bind(this));

    // Calculate delta time
    let delta = 0.016;
    if (this.timer) {
      if (typeof this.timer.update === 'function') {
        this.timer.update();
        delta = this.timer.getDelta();
      } else if (typeof this.timer.getDelta === 'function') {
        delta = this.timer.getDelta();
      }
    }
    const elapsedTime = performance.now() * 0.001;

    // Retrieve acoustic reactive metrics
    const acoustic = this.audioModulator 
      ? this.audioModulator.getAcousticData() 
      : { isSpeaking: false, energy: 0, pulse: 0, frequencies: [], bass: 0, mid: 0, treble: 0 };

    // 1. Smooth Camera Parallax Lerp
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;

    this.camera.position.x = this.mouse.x * 1.5;
    this.camera.position.y = this.mouse.y * 1.0;
    this.camera.lookAt(0, 0, 0);

    // 2. Cosmic Stardust Drift
    if (this.stardustPoints) {
      this.stardustPoints.rotation.y = elapsedTime * 0.02;
      this.stardustPoints.rotation.x = elapsedTime * 0.01;
    }

    // 3. Audio Reactivity per Visualizer Mode
    if (this.activeGroup) {
      // Apply manual drag rotation
      this.activeGroup.rotation.y += (this.orbitRotation.y - this.activeGroup.rotation.y) * 0.1;
      this.activeGroup.rotation.x += (this.orbitRotation.x - this.activeGroup.rotation.x) * 0.1;

      if (this.currentMode === 'core') {
        this._updateModeCore(elapsedTime, delta, acoustic);
      } else if (this.currentMode === 'wave') {
        this._updateModeWave(elapsedTime, delta, acoustic);
      } else if (this.currentMode === 'vortex') {
        this._updateModeVortex(elapsedTime, delta, acoustic);
      }
    }

    // 4. Render
    this.renderer.render(this.scene, this.camera);
  }

  _updateModeCore(time, delta, acoustic) {
    const { coreMesh, wireframeMesh, halo1, halo2 } = this.activeGroup.userData;
    const energy = acoustic.energy;
    const pulse = acoustic.pulse;

    // Rotate core
    const spinSpeed = 0.4 + energy * 1.8;
    if (coreMesh) coreMesh.rotation.y += delta * spinSpeed;
    if (wireframeMesh) wireframeMesh.rotation.y += delta * spinSpeed;

    // Modulate Core Vertices based on acoustics
    if (coreMesh && coreMesh.geometry) {
      const geo = coreMesh.geometry;
      const pos = geo.attributes.position;
      const base = geo.userData.basePositions;
      const count = pos.count;

      const waveFreq = 3.2 + (acoustic.mid * 4.0);
      const waveSpeed = time * (3.0 + energy * 6.0);
      const displacementMagnitude = 0.08 + (energy * 0.45) + (pulse * 0.35);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const bx = base[i3];
        const by = base[i3 + 1];
        const bz = base[i3 + 2];

        // Normal direction from center
        const len = Math.sqrt(bx * bx + by * by + bz * bz) || 1;
        const nx = bx / len;
        const ny = by / len;
        const nz = bz / len;

        // Spherical harmonic wave
        const harmonic = Math.sin(nx * waveFreq + waveSpeed) * 
                         Math.cos(ny * waveFreq + waveSpeed * 1.3) * 
                         Math.sin(nz * waveFreq + waveSpeed * 0.7);

        const push = 1.0 + (harmonic * displacementMagnitude);

        pos.array[i3] = bx * push;
        pos.array[i3 + 1] = by * push;
        pos.array[i3 + 2] = bz * push;
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();

      // Dynamic glow intensity
      if (coreMesh.material) {
        coreMesh.material.emissiveIntensity = 0.4 + energy * 1.5 + pulse * 1.2;
      }
      if (wireframeMesh && wireframeMesh.material) {
        wireframeMesh.material.opacity = 0.35 + energy * 0.45;
      }
    }

    // Spin and pulse halos
    if (halo1) {
      halo1.rotation.y += delta * (0.35 + energy * 1.2);
      const scale1 = 1.0 + (energy * 0.18) + (pulse * 0.15);
      halo1.scale.set(scale1, scale1, scale1);
    }

    if (halo2) {
      halo2.rotation.z += delta * (0.45 + energy * 1.5);
      const scale2 = 1.0 + (energy * 0.22) + (pulse * 0.18);
      halo2.scale.set(scale2, scale2, scale2);
    }
  }

  _updateModeWave(time, delta, acoustic) {
    const { pointGrid, wireMesh } = this.activeGroup.userData;
    const energy = acoustic.energy;
    const pulse = acoustic.pulse;

    if (pointGrid && pointGrid.geometry) {
      const geo = pointGrid.geometry;
      const pos = geo.attributes.position;
      const base = geo.userData.basePositions;
      const count = pos.count;

      const waveSpeed = time * (2.5 + energy * 5.0);
      const waveFreq = 0.45 + (acoustic.bass * 0.5);
      const amp = 0.25 + (energy * 1.6) + (pulse * 0.8);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const bx = base[i3];
        const by = base[i3 + 1];
        
        // Circular ripple from center
        const dist = Math.sqrt(bx * bx + by * by);
        const ripple = Math.sin(dist * waveFreq - waveSpeed) * Math.cos(bx * 0.3 + waveSpeed * 0.5);
        
        pos.array[i3 + 2] = base[i3 + 2] + ripple * amp;
      }
      pos.needsUpdate = true;

      if (pointGrid.material) {
        pointGrid.material.size = 0.08 + (energy * 0.06) + (pulse * 0.05);
      }
    }
  }

  _updateModeVortex(time, delta, acoustic) {
    const { vortexPoints } = this.activeGroup.userData;
    const energy = acoustic.energy;
    const pulse = acoustic.pulse;

    if (vortexPoints && vortexPoints.geometry) {
      const geo = vortexPoints.geometry;
      const pos = geo.attributes.position;
      const orig = geo.userData.originalPositions;
      const count = pos.count;

      // Accelerated vortex spin when speaking
      const spin = time * (0.35 + energy * 1.6);
      vortexPoints.rotation.y = spin;

      const expansion = 1.0 + (energy * 0.4) + (pulse * 0.35);

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const ox = orig[i3];
        const oy = orig[i3 + 1];
        const oz = orig[i3 + 2];

        // Radial turbulence
        const turbulence = Math.sin(time * 4.0 + i) * (energy * 0.25 + pulse * 0.3);

        pos.array[i3] = ox * expansion + turbulence;
        pos.array[i3 + 1] = oy + Math.sin(time * 3 + ox) * (energy * 0.4);
        pos.array[i3 + 2] = oz * expansion + turbulence;
      }
      pos.needsUpdate = true;

      if (vortexPoints.material) {
        vortexPoints.material.size = 0.075 + (energy * 0.08) + (pulse * 0.06);
      }
    }
  }

  _disposeGroup(group) {
    if (!group) return;
    group.traverse((obj) => {
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(mat => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  /**
   * Complete memory cleanup and destruction
   */
  dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.activeGroup) {
      this._disposeGroup(this.activeGroup);
      this.scene.remove(this.activeGroup);
    }
    if (this.stardustPoints) {
      this._disposeGroup(this.stardustPoints);
      this.scene.remove(this.stardustPoints);
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement && this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    window.removeEventListener('resize', this._onWindowResize.bind(this));
  }
}

window.Visualizer3D = Visualizer3D;
