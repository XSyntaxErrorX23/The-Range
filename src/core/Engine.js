import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Owns the renderer, scene and camera. Pure rendering concerns only — no game
 * logic. Handles resize and the ADS FOV transition.
 */
export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();

    // image-based environment for PBR reflections (generated, no asset files)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35; // subtle — fill lights still dominate
    pmrem.dispose();

    this.baseFov = 90;
    this.fov = this.baseFov;
    this.camera = new THREE.PerspectiveCamera(
      this.fov,
      window.innerWidth / window.innerHeight,
      0.05,
      400
    );
    this.camera.rotation.order = 'YXZ'; // yaw then pitch — matches our look rig
    // The camera must be in the scene graph so camera-parented objects
    // (first-person viewmodel, muzzle flash) are traversed and rendered.
    this.scene.add(this.camera);

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
  }

  /** Set effective FOV (base * mult) for ADS zoom; `fovMult` of 1 = hipfire. */
  setFovMult(mult) {
    const target = this.baseFov * mult;
    if (Math.abs(target - this.camera.fov) > 0.001) {
      this.camera.fov = target;
      this.camera.updateProjectionMatrix();
    }
  }

  setBaseFov(fov) {
    this.baseFov = fov;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
