// frontend/src/animations/three-scene.js
// Three.js scene manager. Single animated canvas with auto resize, lazy init,
// proper disposal, and reduced-motion / mobile safeguards.

import * as THREE from '../../assets/vendor/three.module.js';

let rafId = null;

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function isThreeReduced() {
  return REDUCE || !('WebGLRenderingContext' in window);
}

export class ThreeSceneManager {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      color: 0x22d3ee,
      innerColor: 0x8b5cf6,
      particleCount: 150,
      pixelRatioCap: 2,
      rotationSpeed: { x: 0.002, y: 0.003 },
      mouseSensitivity: 0.02,
      ...options,
    };
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.mesh = null;
    this.innerMesh = null;
    this.points = null;
    this.lights = [];
    this.mouse = { x: 0, y: 0 };
    this.width = 0;
    this.height = 0;
    this.disposed = false;
    this.boundAnimate = this.animate.bind(this);
    this.boundResize = this.resize.bind(this);
  }

  init() {
    if (this.disposed || !this.canvas) return false;
    if (isThreeReduced()) {
      console.warn('Three.js disabled: reduced motion or no WebGL');
      return false;
    }
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.options.pixelRatioCap));
      this.resize();

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, this.width / this.height || 1, 0.1, 100);
      this.camera.position.z = 4;

      const geo = new THREE.IcosahedronGeometry(1.4, 2);
      const mat = new THREE.MeshStandardMaterial({ color: this.options.color, wireframe: true, transparent: true, opacity: 0.85 });
      this.mesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.mesh);

      const innerGeo = new THREE.IcosahedronGeometry(0.9, 1);
      const innerMat = new THREE.MeshStandardMaterial({ color: this.options.innerColor, wireframe: true, transparent: true, opacity: 0.6 });
      this.innerMesh = new THREE.Mesh(innerGeo, innerMat);
      this.scene.add(this.innerMesh);

      const light1 = new THREE.DirectionalLight(0xffffff, 1.2);
      light1.position.set(3, 3, 3);
      this.scene.add(light1);
      this.lights.push(light1);

      const light2 = new THREE.PointLight(this.options.innerColor, 1.5, 10);
      light2.position.set(-2, -2, 2);
      this.scene.add(light2);
      this.lights.push(light2);

      const ambient = new THREE.AmbientLight(0x22d3ee, 0.4);
      this.scene.add(ambient);

      // Particle system
      const pGeo = new THREE.BufferGeometry();
      const count = this.options.particleCount;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 8;
      pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pMat = new THREE.PointsMaterial({ color: this.options.color, size: 0.03, transparent: true, opacity: 0.7 });
      this.points = new THREE.Points(pGeo, pMat);
      this.scene.add(this.points);

      // Mouse interaction
      window.addEventListener('mousemove', this.boundMouseMove);
      window.addEventListener('resize', this.boundResize);

      this.animate();
      return true;
    } catch (e) {
      console.warn('Three.js init failed', e);
      return false;
    }
  }

  boundMouseMove = (e) => {
    this.mouse.x = (e.clientX / window.innerWidth - 0.5) * 0.5;
    this.mouse.y = (e.clientY / window.innerHeight - 0.5) * 0.5;
  };

  resize() {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 460;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (this.disposed) return;
    rafId = requestAnimationFrame(this.boundAnimate);
    const { mesh, innerMesh, points } = this;
    if (mesh) {
      mesh.rotation.x += this.options.rotationSpeed.x;
      mesh.rotation.y += this.options.rotationSpeed.y;
      mesh.rotation.x += (this.mouse.y - mesh.rotation.x) * this.options.mouseSensitivity;
      mesh.rotation.y += (this.mouse.x - mesh.rotation.y) * this.options.mouseSensitivity;
    }
    if (innerMesh) {
      innerMesh.rotation.x -= this.options.rotationSpeed.x * 2;
      innerMesh.rotation.y -= this.options.rotationSpeed.y * 1.5;
    }
    if (points) points.rotation.y += 0.0008;
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    this.disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('mousemove', this.boundMouseMove);
    window.removeEventListener('resize', this.boundResize);
    if (this.renderer) {
      [this.mesh, this.innerMesh].forEach((m) => {
        if (m) {
          if (m.geometry) m.geometry.dispose();
          if (m.material) m.material.dispose();
        }
      });
      if (this.points) {
        if (this.points.geometry) this.points.geometry.dispose();
        if (this.points.material) this.points.material.dispose();
      }
      this.lights.forEach((l) => { if (l) l.dispose?.(); });
      this.renderer.dispose();
      this.renderer = null;
    }
    this.scene = null;
    this.camera = null;
    this.mesh = null;
    this.innerMesh = null;
    this.points = null;
    this.lights = [];
  }
}

/**
 * Convenience: create and init a Three.js hero scene on a canvas.
 * Returns the manager (call .dispose() on page unload / navigation).
 */
export function initHero3D(canvasId, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const mgr = new ThreeSceneManager(canvas, options);
  mgr.init();
  return mgr;
}

