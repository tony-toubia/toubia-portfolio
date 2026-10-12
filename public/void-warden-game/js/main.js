// Void Warden Entry Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    // Detect iframe embedding
    const inIframe = window.self !== window.top;
    if (inIframe) {
        document.body.classList.add('in-iframe');
    }

    // Audio unlock on first user interaction
    const unlockAudio = () => {
        window.audioManager.init();
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio, { passive: true });
    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    // Instantiate Main Game
    window.gameInstance = new Game();

    // Auto-pause if user switches browser tab
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && window.gameInstance && window.gameInstance.state === 'PLAYING') {
            window.gameInstance.togglePause();
        }
    });
});
