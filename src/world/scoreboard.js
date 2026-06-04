import * as THREE from 'three';

/**
 * Suspended in-world scoreboard (the central hanging board in The Range).
 * Draws two big numbers via a CanvasTexture, refreshed on demand.
 */
export class Scoreboard {
  constructor(scene, position = new THREE.Vector3(0, 5.3, 30)) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.group = new THREE.Group();

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 2.4, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x11161c, roughness: 0.7, metalness: 0.3 })
    );
    this.group.add(frame);

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(4.1, 2.1),
      new THREE.MeshBasicMaterial({ map: this.texture })
    );
    screen.position.z = 0.1;
    this.group.add(screen);
    // back face so it reads from behind too
    const screenBack = screen.clone();
    screenBack.position.z = -0.1;
    screenBack.rotation.y = Math.PI;
    this.group.add(screenBack);

    // suspension cables to the ceiling
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    for (const dx of [-1.6, 1.6]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 6), cableMat);
      cable.position.set(dx, 2.5, 0);
      this.group.add(cable);
    }

    this.group.position.copy(position);
    scene.add(this.group);

    this.setValues(0, 0);
  }

  setValues(score, best) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = '#0a1014';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#46e0d6';
    ctx.fillRect(0, 0, W, 6);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#8b9aa3';
    ctx.font = '600 28px "Segoe UI", sans-serif';
    ctx.fillText('SCORE', W * 0.27, 56);
    ctx.fillText('BEST', W * 0.73, 56);

    ctx.fillStyle = '#e7ecef';
    ctx.font = '700 120px "Segoe UI", sans-serif';
    ctx.fillText(String(score).padStart(2, '0'), W * 0.27, 150);
    ctx.fillStyle = '#46e0d6';
    ctx.fillText(String(best).padStart(2, '0'), W * 0.73, 150);

    this.texture.needsUpdate = true;
  }
}
