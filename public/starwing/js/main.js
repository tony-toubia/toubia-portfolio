// Starwing 64: Application Bootstrap & Frame Loop.
(function () {
    'use strict';
    const SW = window.SW = window.SW || {};

    function boot() {
        const stage = document.getElementById('stage');
        const canvas = document.getElementById('gl-canvas');
        const hud = document.getElementById('hud-canvas');

        const renderer = new SW.Renderer(stage, canvas, hud);
        const ui = new SW.UI();
        const game = new SW.Game(renderer, ui);
        ui.bind(game);
        const input = new SW.InputController(game);

        window.addEventListener('resize', () => renderer.resize());

        let last = performance.now();
        function frame(now) {
            const dt = Math.min(0.05, Math.max(0.001, (now - last) * 0.001));
            last = now;
            const inp = input.sample();
            game.update(dt, inp);
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);

        SW.instance = { renderer, ui, game, input };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
