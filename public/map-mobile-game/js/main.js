/**
 * Primal Hunt - boot and main loop.
 *
 * The simulation runs on a fixed step, so a phone drawing 30 frames a second
 * plays the same game as a desktop drawing 120. (The previous version tied its
 * clock to the frame rate; under load its ten-minute timer ran slow.)
 */
(() => {
  const canvas = document.getElementById('scene');
  if (window.self !== window.top) document.body.classList.add('in-iframe');

  let render;
  try {
    render = new PH.Render(canvas);
  } catch (e) {
    console.error(e);
    document.getElementById('menu').classList.remove('active');
    document.getElementById('nogl').classList.add('active');
    return;
  }

  const game = new PH.Game(render);
  const monster = new PH.MonsterGame(render);
  const hunt = new PH.HuntGame(render);
  const ui = new PH.UI(game, render, monster, hunt);
  game.hooks = ui.hooks();
  monster.hooks = ui.hooks();
  render.sfx = (n) => ui.sfx(n);
  render.haptic = (a) => ui.haptic(Math.round(20 + a * 70));   // big hits rumble    // the storm's thunder comes from the renderer
  hunt.hooks = ui.hooks();

  // Browsers only allow audio after a user gesture.
  const unlock = () => {
    if (window.Sfx) { window.Sfx.init(); window.Sfx.resume(); ui.applyMute(); }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  // Real character models load in the background and swap in when ready.
  if (PH.Models) PH.Models.load().then(() => render.modelsReady());

  const resize = () => render.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  resize();

  game.attract(ui.selectedClass || 'assault');

  const STEP = PH.CONFIG.step;
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const game = ui.game;             // survival or monster, whichever is running
    ui.applyInput();
    if (game.state === 'playing') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) { game.update(STEP); acc -= STEP; n++; }
      if (n === 5) acc = 0;        // badly behind: drop time rather than spiral
    } else {
      acc = 0;
    }
    // Paused and level-up screens freeze the world but keep it on screen.
    const frozen = game.state === 'paused' || game.state === 'choice';
    render.frame(game, frozen ? 0 : dt);
    ui.frame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Handle for automated playtests; harmless otherwise.
  window.__ph = { get game() { return ui.game; }, survival: game, monster, hunt, render, ui };
})();
