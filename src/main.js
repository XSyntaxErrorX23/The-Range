import './styles.css';
import { Game } from './core/Game.js';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.start();
  // expose for debugging in the console
  window.game = game;
});
