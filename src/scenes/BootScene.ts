import Phaser from 'phaser';
import { DOMOverlay } from '../ui/DOMOverlay';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // No assets to load for placeholder aesthetic
    // Just showing a loading indicator
    const { width, height } = this.cameras.main;

    const text = this.add.text(width / 2, height / 2, 'Loading...', {
      fontSize: '24px',
      color: '#95a5a6',
    });
    text.setOrigin(0.5);
  }

  create(): void {
    // Initialize the DOM overlay system
    DOMOverlay.init();

    // Go straight to main menu
    this.scene.start('MainMenuScene');
  }
}
