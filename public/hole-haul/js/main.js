// Hole Haul: start-up.
(() => {
    const boot = () => {
        if (!window.THREE || !window.CANNON || !window.HH_MODELS || !window.HH_LEVELS) { document.querySelector('.loading-text').textContent = 'Could not load the game.'; return; }
        if (window.self !== window.top && !/[?&]standalone=1\b/.test(location.search)) document.body.classList.add('in-iframe');
        const ui = window.hh = new window.HH_UI();
        ui.showMap();
        // ?level=N jumps straight into a level (handy for testing and sharing).
        const m = /[?&]level=(\d+)/.exec(location.search);
        if (m) ui.play(Math.max(0, Math.min(window.HH_LEVELS.count - 1, parseInt(m[1], 10) - 1)));
        setTimeout(() => document.getElementById('loading').classList.add('gone'), 150);
    };
    // Boot once the page is parsed and the physics module (a deferred ES module) has set window.CANNON.
    let booted = false;
    const tryBoot = () => { if (booted || document.readyState === 'loading' || !window.CANNON) return; booted = true; boot(); };
    document.addEventListener('DOMContentLoaded', tryBoot);
    window.addEventListener('hh-physics', tryBoot);
    tryBoot();
    setTimeout(() => { if (!booted) document.querySelector('.loading-text').textContent = 'Could not load the game.'; }, 15000);
})();
