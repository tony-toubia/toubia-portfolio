/**
 * Primal Hunt - Main Entry Point
 * Hunters vs Monsters Mobile Game
 */

// Initialize game on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Primal Hunt - Initializing...');

    // Load settings
    GameSettings.load();

    // Create UI manager
    window.ui = new UIManager();

    // Create game instance (initialized when play is clicked)
    window.game = null;

    // Handle visibility change (pause when tab is hidden)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && window.game && window.game.running) {
            window.ui.togglePause();
        }
    });

    // Prevent default touch behaviors on game elements
    document.body.addEventListener('touchmove', (e) => {
        if (e.target.closest('#game-screen')) {
            e.preventDefault();
        }
    }, { passive: false });

    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        if (window.game) {
            window.game.resize();
        }
    });

    // Add keyboard shortcut hints for desktop
    if (!Utils.isMobile()) {
        addDesktopHints();
    }

    console.log('Primal Hunt - Ready!');
});

/**
 * Add desktop control hints
 */
function addDesktopHints() {
    const hint = document.createElement('div');
    hint.style.cssText = `
        position: fixed;
        bottom: 10px;
        left: 10px;
        background: rgba(0,0,0,0.7);
        color: #888;
        padding: 8px 12px;
        border-radius: 5px;
        font-size: 12px;
        z-index: 1000;
        pointer-events: none;
    `;
    hint.innerHTML = 'WASD: Move | 1-6: Abilities | Space: Attack | ESC: Pause';

    // Only show on game screen
    const observer = new MutationObserver(() => {
        const gameScreen = document.getElementById('game-screen');
        hint.style.display = gameScreen.classList.contains('active') ? 'block' : 'none';
    });

    observer.observe(document.getElementById('game-screen'), {
        attributes: true,
        attributeFilter: ['class']
    });

    hint.style.display = 'none';
    document.body.appendChild(hint);
}

/**
 * Service Worker Registration (for PWA support)
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Could register a service worker here for offline support
        // navigator.serviceWorker.register('/sw.js');
    });
}

/**
 * Debug helpers (can be removed in production)
 */
window.debug = {
    // Give player upgrade points
    addPoints(amount = 10) {
        if (window.game && window.game.player) {
            window.game.player.upgradePoints = (window.game.player.upgradePoints || 0) + amount;
            console.log(`Added ${amount} upgrade points`);
        }
    },

    // Evolve monster
    evolve() {
        if (window.game && window.game.player instanceof Monster) {
            window.game.player.feed(100);
            console.log('Fed monster');
        }
    },

    // Heal player
    heal() {
        if (window.game && window.game.player) {
            window.game.player.health = window.game.player.maxHealth;
            console.log('Healed player');
        }
    },

    // Kill all enemies
    killAll() {
        if (window.game) {
            window.game.entities.forEach(e => {
                if (e !== window.game.player && e.team !== window.game.player.team) {
                    e.health = 0;
                    e.isAlive = false;
                }
            });
            console.log('Killed all enemies');
        }
    },

    // Toggle god mode
    godMode: false,
    god() {
        this.godMode = !this.godMode;
        if (window.game && window.game.player) {
            if (this.godMode) {
                window.game.player.maxHealth = 99999;
                window.game.player.health = 99999;
                window.game.player.damage *= 10;
            }
            console.log(`God mode: ${this.godMode ? 'ON' : 'OFF'}`);
        }
    },

    // Get game stats
    stats() {
        if (window.game) {
            console.log(window.game.stats);
            return window.game.stats;
        }
    },

    // Toggle 3D mode
    toggle3D() {
        if (window.game) {
            window.game.use3D = !window.game.use3D;
            console.log(`3D Mode: ${window.game.use3D ? 'ON' : 'OFF'}`);
            console.log('Restart the game for changes to take effect');
        }
    },

    // Toggle post-processing
    togglePostProcessing() {
        if (window.game && window.game.postProcessing) {
            window.game.postProcessing.enabled = !window.game.postProcessing.enabled;
            console.log(`Post-processing: ${window.game.postProcessing.enabled ? 'ON' : 'OFF'}`);
        }
    },

    // Adjust bloom intensity
    setBloom(strength = 0.5) {
        if (window.game && window.game.postProcessing) {
            window.game.postProcessing.setBloomStrength(strength);
            console.log(`Bloom strength: ${strength}`);
        }
    }
};

/**
 * Handle errors gracefully
 */
window.onerror = (msg, url, line, col, error) => {
    console.error('Game Error:', msg, 'at', url, line, col);
    // Could show user-friendly error message here
    return false;
};
