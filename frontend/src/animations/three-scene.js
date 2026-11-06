import * as THREE from '../../assets/vendor/three.module.js';

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function isThreeReduced() {
  return REDUCE || !('WebGLRenderingContext' in window);
}

export class ThreeSceneManager {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      color: 0x35d5f2,
      innerColor: 0x8b5cf6,
      particleCount: 90,
      pixelRatioCap: 1.75,
      rotationSpeed: 0.0015,
      variant: 'network',
      ...options,
    };
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.group = null;
    this.animationFrame = null;
    this.disposed = false;
    this.targetRotation = { x: -0.24, y: -0.24 };
    this.drag = null;
    this.rings = [];
    this.interactiveMeshes = [];
    this.raycaster = new THREE.Raycaster();
    this.pointerPosition = new THREE.Vector2();
    this.hoveredMesh = null;
    this.boundAnimate = this.animate.bind(this);
    this.boundResize = this.resize.bind(this);
    this.boundPointerDown = this.onPointerDown.bind(this);
    this.boundPointerMove = this.onPointerMove.bind(this);
    this.boundPointerUp = this.onPointerUp.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundVisibilityChange = () => {
      if (document.hidden) {
        if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      } else if (!this.disposed && this.renderer && this.animationFrame === null) {
        this.animate();
      }
    };
  }

  init() {
    if (this.disposed || !this.canvas || this.renderer) return false;
    if (isThreeReduced()) return false;

    try {
      const width = this.canvas.clientWidth || 600;
      const height = this.canvas.clientHeight || 460;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      this.camera.position.set(
        0,
        this.options.variant === 'business' ? 1.9 : 0,
        this.options.variant === 'business' ? 5.1 : 4.8,
      );
      this.camera.lookAt(0, 0, 0);
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.pixelRatioCap));
      this.renderer.setClearColor(0x000000, 0);

      this.group = new THREE.Group();
      this.scene.add(this.group);
      if (this.options.variant === 'business') this.createBusinessScene();
      else this.createNetwork();
      this.createLights();
      this.createBackgroundParticles();
      this.resize();

      this.canvas.addEventListener('pointerdown', this.boundPointerDown);
      this.canvas.addEventListener('pointermove', this.boundPointerMove);
      this.canvas.addEventListener('pointerup', this.boundPointerUp);
      this.canvas.addEventListener('pointercancel', this.boundPointerUp);
      this.canvas.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('resize', this.boundResize, { passive: true });
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
      this.animate();
      return true;
    } catch (error) {
      console.warn('Three.js initialization failed:', error);
      this.dispose();
      return false;
    }
  }

  createNetwork() {
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), new THREE.MeshStandardMaterial({
      color: 0x101a3c,
      emissive: this.options.innerColor,
      emissiveIntensity: 0.45,
      metalness: 0.4,
      roughness: 0.24,
    }));
    this.group.add(core);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.62, 1),
      new THREE.MeshBasicMaterial({
        color: this.options.color,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
      }),
    );
    this.group.add(shell);

    const nodes = [
      { position: [-1.28, 0.82, -0.4], color: this.options.color },
      { position: [-1.35, -0.3, 0.35], color: this.options.innerColor },
      { position: [-0.65, -1.05, -0.2], color: 0xa2b9ff },
      { position: [1.22, -0.72, 0.25], color: 0x45d6a5 },
      { position: [1.32, 0.42, -0.45], color: this.options.color },
      { position: [0.5, 1.08, 0.2], color: this.options.innerColor },
    ];
    const edgePositions = [];
    nodes.forEach(({ position }, index) => {
      const point = new THREE.Vector3(...position);
      edgePositions.push(0, 0, 0, ...position);
      const next = nodes[(index + 1) % nodes.length].position;
      edgePositions.push(...position, ...next);

      const node = new THREE.Mesh(
        new THREE.OctahedronGeometry(index % 2 ? 0.09 : 0.075, 0),
        new THREE.MeshStandardMaterial({
          color: nodes[index].color,
          emissive: nodes[index].color,
          emissiveIntensity: 0.4,
          metalness: 0.3,
          roughness: 0.28,
        }),
      );
      node.position.copy(point);
      this.group.add(node);
    });

    const edges = new THREE.BufferGeometry();
    edges.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    this.group.add(new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: this.options.color, transparent: true, opacity: 0.3 }),
    ));

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.006, 6, 96),
      new THREE.MeshBasicMaterial({ color: this.options.innerColor, transparent: true, opacity: 0.2 }),
    );
    ring.rotation.set(0.85, 0.5, 0.2);
    this.rings.push(ring);
    this.group.add(ring);
  }

  createBusinessScene() {
    const makeMaterial = (color, emissive = 0x000000) => new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: emissive ? 0.32 : 0,
      metalness: 0.38,
      roughness: 0.34,
    });
    const addBox = (parent, size, position, color, emissive = 0x000000) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), makeMaterial(color, emissive));
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    };

    addBox(this.group, [3.65, 0.12, 2.75], [0, -0.25, 0], 0x111d39, 0x142652);
    addBox(this.group, [3.48, 0.025, 2.58], [0, -0.177, 0], 0x0b1329);

    const gridPoints = [];
    for (let x = -1.5; x <= 1.5; x += 0.25) {
      gridPoints.push(new THREE.Vector3(x, -0.158, -1.15), new THREE.Vector3(x, -0.158, 1.15));
    }
    for (let z = -1.15; z <= 1.15; z += 0.25) {
      gridPoints.push(new THREE.Vector3(-1.5, -0.158, z), new THREE.Vector3(1.5, -0.158, z));
    }
    const grid = new THREE.BufferGeometry().setFromPoints(gridPoints);
    this.group.add(new THREE.LineSegments(grid, new THREE.LineBasicMaterial({
      color: this.options.color,
      transparent: true,
      opacity: 0.12,
    })));

    const center = new THREE.Group();
    center.position.set(0, 0.16, 0.03);
    this.group.add(center);
    const dashboard = addBox(center, [1.2, 0.1, 0.82], [0, 0.03, 0], 0x18284a, 0x1b4e83);
    dashboard.userData.sceneLabel = 'مساحة المشروع — نظرة عامة';
    this.interactiveMeshes.push(dashboard);
    addBox(center, [0.72, 0.035, 0.045], [0, 0.099, -0.31], this.options.color, this.options.color);
    [-0.31, -0.1, 0.11, 0.32].forEach((x, index) => {
      const height = 0.12 + [0.16, 0.25, 0.19, 0.31][index];
      const color = index === 3 ? this.options.innerColor : this.options.color;
      addBox(center, [0.09, height, 0.11], [x, 0.105 + height / 2, 0.13], color, color);
    });
    addBox(center, [0.35, 0.025, 0.045], [-0.28, 0.1, 0.29], 0x8299bd);
    addBox(center, [0.23, 0.025, 0.045], [0.19, 0.1, 0.29], 0x506382);

    const milestones = [
      { position: [-1.05, 0.08, 0.38], color: this.options.color, label: 'الفكرة — تحديد نطاق العمل' },
      { position: [1.05, 0.08, 0.38], color: this.options.innerColor, label: 'السوق — تنظيم فرص النمو' },
      { position: [0, 0.08, -0.83], color: 0x45d6a5, label: 'التنفيذ — متابعة الخطوات' },
    ];
    milestones.forEach(({ position, color, label }, index) => {
      const card = new THREE.Group();
      card.position.set(...position);
      this.group.add(card);
      const tile = addBox(card, [0.82, 0.08, 0.5], [0, 0, 0], 0x15213c, color);
      tile.userData.sceneLabel = label;
      this.interactiveMeshes.push(tile);
      addBox(card, [0.38, 0.025, 0.035], [0, 0.055, -0.13], color, color);
      addBox(card, [0.56, 0.022, 0.035], [0, 0.055, 0.01], 0x637695);
      addBox(card, [0.32, 0.022, 0.035], [-0.12, 0.055, 0.1], 0x3d4d69);

      const connector = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.12, 0.03),
        new THREE.Vector3(position[0], position[1], position[2]),
      ]);
      this.group.add(new THREE.Line(connector, new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.68,
      })));

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(index === 0 ? 0.075 : 0.065, 18, 14),
        makeMaterial(color, color),
      );
      marker.position.set(position[0], 0.16, position[2]);
      this.group.add(marker);
    });

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.009, 8, 96),
      new THREE.MeshBasicMaterial({ color: this.options.color, transparent: true, opacity: 0.4 }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, -0.1, 0.03);
    this.group.add(halo);
    this.rings.push(halo);
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    this.drag = { x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add('is-dragging');
  }

  onPointerMove(event) {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.pointerPosition.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );

    if (this.drag) {
      this.targetRotation.y += (event.clientX - this.drag.x) * 0.008;
      this.targetRotation.x = THREE.MathUtils.clamp(
        this.targetRotation.x + (event.clientY - this.drag.y) * 0.005,
        -0.75,
        0.45,
      );
      this.drag = { x: event.clientX, y: event.clientY };
      return;
    }
    this.updateHover();
  }

  onPointerUp() {
    this.drag = null;
    this.canvas.classList.remove('is-dragging');
  }

  onKeyDown(event) {
    const step = 0.16;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.targetRotation.y += event.key === 'ArrowLeft' ? -step : step;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.targetRotation.x = THREE.MathUtils.clamp(
        this.targetRotation.x + (event.key === 'ArrowUp' ? -step : step),
        -0.75,
        0.45,
      );
    }
  }

  updateHover() {
    if (!this.camera || !this.interactiveMeshes.length || this.drag) return;
    this.raycaster.setFromCamera(this.pointerPosition, this.camera);
    const hit = this.raycaster.intersectObjects(this.interactiveMeshes, false)[0];
    const next = hit ? hit.object : null;
    if (next === this.hoveredMesh) return;
    if (this.hoveredMesh) this.hoveredMesh.scale.setScalar(1);
    this.hoveredMesh = next;
    if (this.hoveredMesh) this.hoveredMesh.scale.setScalar(1.06);
    this.canvas.dispatchEvent(new CustomEvent('scenehover', {
      detail: { label: this.hoveredMesh ? this.hoveredMesh.userData.sceneLabel : '' },
    }));
  }

  resetView() {
    this.targetRotation.x = -0.24;
    this.targetRotation.y = -0.24;
  }

  rotateBy(amount) {
    this.targetRotation.y += amount;
  }

  createLights() {
    this.scene.add(new THREE.AmbientLight(0x8299ff, 1.15));
    const cyanLight = new THREE.PointLight(this.options.color, 34, 8);
    cyanLight.position.set(2.4, 2.2, 3);
    this.scene.add(cyanLight);
    const violetLight = new THREE.PointLight(this.options.innerColor, 28, 8);
    violetLight.position.set(-2.2, -1.6, 1);
    this.scene.add(violetLight);
  }

  createBackgroundParticles() {
    const count = 80;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 7;
      positions[index * 3 + 1] = (Math.random() - 0.5) * 5;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 3 - 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scene.add(new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xa2b9ff,
        size: 0.012,
        transparent: true,
        opacity: 0.34,
        sizeAttenuation: true,
      }),
    ));
  }

  resize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const width = this.canvas.clientWidth || 600;
    const height = this.canvas.clientHeight || 460;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (this.disposed || !this.renderer || document.hidden) return;
    this.animationFrame = requestAnimationFrame(this.boundAnimate);
    this.targetRotation.y += this.options.rotationSpeed;
    this.group.rotation.x += (this.targetRotation.x - this.group.rotation.x) * 0.045;
    this.group.rotation.y += (this.targetRotation.y - this.group.rotation.y) * 0.045;
    this.rings.forEach((ring, index) => {
      ring.rotation.z += this.options.rotationSpeed * (index % 2 ? -0.8 : 0.65);
    });
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.canvas.removeEventListener('pointerdown', this.boundPointerDown);
    this.canvas.removeEventListener('pointermove', this.boundPointerMove);
    this.canvas.removeEventListener('pointerup', this.boundPointerUp);
    this.canvas.removeEventListener('pointercancel', this.boundPointerUp);
    this.canvas.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('resize', this.boundResize);
    document.removeEventListener('visibilitychange', this.boundVisibilityChange);

    if (this.scene) {
      const geometries = new Set();
      const materials = new Set();
      this.scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
        else if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    }
    if (this.renderer) this.renderer.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.group = null;
    this.rings = [];
    this.interactiveMeshes = [];
  }
}

export function initHero3D(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const manager = new ThreeSceneManager(canvas, options);
  manager.init();
  return manager;
}
