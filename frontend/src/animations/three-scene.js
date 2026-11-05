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
      ...options,
    };
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.group = null;
    this.animationFrame = null;
    this.disposed = false;
    this.pointer = { x: 0, y: 0 };
    this.rings = [];
    this.boundAnimate = this.animate.bind(this);
    this.boundResize = this.resize.bind(this);
    this.boundMouseMove = (event) => {
      this.pointer.x = (event.clientX / window.innerWidth - 0.5) * 0.6;
      this.pointer.y = (event.clientY / window.innerHeight - 0.5) * 0.6;
    };
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
      this.camera.position.set(0, 0, 4.8);
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
      this.createNetwork();
      this.createLights();
      this.createBackgroundParticles();
      this.resize();

      window.addEventListener('mousemove', this.boundMouseMove, { passive: true });
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
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 48, 32),
      new THREE.MeshStandardMaterial({
        color: 0x101a3c,
        emissive: this.options.innerColor,
        emissiveIntensity: 0.28,
        metalness: 0.42,
        roughness: 0.24,
        transparent: true,
        opacity: 0.96,
      }),
    );
    this.group.add(core);

    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.38, 2),
      new THREE.MeshBasicMaterial({
        color: this.options.color,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
      }),
    );
    this.group.add(shell);

    const pointCount = Math.max(24, Math.min(180, this.options.particleCount));
    const positions = [];
    const nodes = [];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let index = 0; index < pointCount; index += 1) {
      const y = 1 - (index / (pointCount - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = goldenAngle * index;
      const node = [
        Math.cos(angle) * radius * 1.42,
        y * 1.42,
        Math.sin(angle) * radius * 1.42,
      ];
      nodes.push(node);
      positions.push(...node);
    }

    const edgePositions = [];
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const distance = Math.hypot(
          nodes[left][0] - nodes[right][0],
          nodes[left][1] - nodes[right][1],
          nodes[left][2] - nodes[right][2],
        );
        if (distance < 0.58) edgePositions.push(...nodes[left], ...nodes[right]);
      }
    }

    const edges = new THREE.BufferGeometry();
    edges.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    this.group.add(new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: this.options.color, transparent: true, opacity: 0.19 }),
    ));

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.group.add(new THREE.Points(
      nodeGeometry,
      new THREE.PointsMaterial({ color: this.options.color, size: 0.045, sizeAttenuation: true }),
    ));

    const rings = [
      new THREE.MeshBasicMaterial({ color: this.options.color, transparent: true, opacity: 0.42 }),
      new THREE.MeshBasicMaterial({ color: this.options.innerColor, transparent: true, opacity: 0.34 }),
      new THREE.MeshBasicMaterial({ color: this.options.color, transparent: true, opacity: 0.22 }),
    ];
    rings.forEach((material, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.68 + index * 0.08, 0.007, 6, 144), material);
      ring.rotation.set(index * 0.82, index * 0.94, index * 0.34);
      this.rings.push(ring);
      this.group.add(ring);
    });
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
    this.group.rotation.y += this.options.rotationSpeed;
    this.group.rotation.x += (this.pointer.y * 0.25 - this.group.rotation.x) * 0.025;
    this.group.rotation.y += (this.pointer.x * 0.3 - this.group.rotation.y) * 0.01;
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
    window.removeEventListener('mousemove', this.boundMouseMove);
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
  }
}

export function initHero3D(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const manager = new ThreeSceneManager(canvas, options);
  manager.init();
  return manager;
}
