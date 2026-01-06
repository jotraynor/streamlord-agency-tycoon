import Phaser from 'phaser';
import { GameManager } from '../core/GameManager';
import { DOMOverlay } from '../ui/DOMOverlay';

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    DOMOverlay.clear();

    const hasSave = GameManager.hasSave();

    DOMOverlay.renderMainMenu(
      hasSave,
      () => this.startNewGame(),
      () => this.continueGame()
    );
  }

  private startNewGame(): void {
    GameManager.deleteSave();
    GameManager.newGame();
    this.scene.start('OfficeScene');
  }

  private continueGame(): void {
    if (GameManager.loadGame()) {
      this.scene.start('OfficeScene');
    } else {
      // Save corrupted, start new
      this.startNewGame();
    }
  }
}
