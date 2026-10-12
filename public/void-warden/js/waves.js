// Wave Management & Spawning Logic for Void Warden
class WaveManager {
    constructor(entityManager) {
        this.em = entityManager;
        this.currentWave = 1;
        this.maxCampaignWaves = 5;
        this.isEndless = false;

        this.waveInProgress = false;
        this.spawnQueue = [];
        this.spawnTimer = 0;
        this.waveDuration = 0;
        this.waveTimer = 0;

        // Map spawn boundaries (top z)
        this.spawnZ = -17;
        this.spawnXMin = -14;
        this.spawnXMax = 14;
    }

    startWave(waveNum, isEndless = false) {
        this.currentWave = waveNum;
        this.isEndless = isEndless;
        this.waveInProgress = true;
        this.waveTimer = 0;
        this.spawnTimer = 0;
        this.spawnQueue = this.buildWaveSpawns(waveNum, isEndless);
    }

    buildWaveSpawns(waveNum, isEndless) {
        const spawns = [];

        if (!isEndless) {
            if (waveNum === 1) {
                // Wave 1: Outbreak Basics (Shamblers + 3 Civilians)
                for (let i = 0; i < 18; i++) {
                    spawns.push({ time: i * 1.5, type: 'shambler' });
                }
                spawns.push({ time: 4.0, type: 'civilian' });
                spawns.push({ time: 12.0, type: 'civilian' });
                spawns.push({ time: 18.0, type: 'civilian' });

            } else if (waveNum === 2) {
                // Wave 2: Crimson Sprinters (Fast targets)
                for (let i = 0; i < 16; i++) {
                    spawns.push({ time: i * 1.2, type: 'shambler' });
                }
                for (let i = 0; i < 8; i++) {
                    spawns.push({ time: 3.0 + i * 2.2, type: 'sprinter' });
                }
                spawns.push({ time: 6.0, type: 'civilian' });
                spawns.push({ time: 14.0, type: 'civilian' });

            } else if (waveNum === 3) {
                // Wave 3: Toxic Bio-Hazard (Acid Bloaters)
                for (let i = 0; i < 20; i++) {
                    spawns.push({ time: i * 1.1, type: 'shambler' });
                }
                for (let i = 0; i < 6; i++) {
                    spawns.push({ time: 2.0 + i * 3.5, type: 'bloater' });
                }
                for (let i = 0; i < 8; i++) {
                    spawns.push({ time: 5.0 + i * 2.0, type: 'sprinter' });
                }
                spawns.push({ time: 7.0, type: 'civilian' });
                spawns.push({ time: 15.0, type: 'civilian' });

            } else if (waveNum === 4) {
                // Wave 4: Goliath's March (First Mutated Brute)
                spawns.push({ time: 1.0, type: 'brute' }); // Walk slowly from beginning
                for (let i = 0; i < 24; i++) {
                    spawns.push({ time: i * 0.9, type: 'shambler' }); // Feed the hole!
                }
                for (let i = 0; i < 8; i++) {
                    spawns.push({ time: 4.0 + i * 2.5, type: 'bloater' });
                }
                for (let i = 0; i < 10; i++) {
                    spawns.push({ time: 6.0 + i * 1.8, type: 'sprinter' });
                }
                spawns.push({ time: 10.0, type: 'civilian' });
                spawns.push({ time: 18.0, type: 'civilian' });

            } else if (waveNum === 5) {
                // Wave 5: Final Stand (Dual Brutes + massive horde)
                spawns.push({ time: 0.5, type: 'brute' });
                spawns.push({ time: 12.0, type: 'brute' });
                for (let i = 0; i < 35; i++) {
                    spawns.push({ time: i * 0.7, type: 'shambler' });
                }
                for (let i = 0; i < 12; i++) {
                    spawns.push({ time: 3.0 + i * 1.8, type: 'sprinter' });
                }
                for (let i = 0; i < 8; i++) {
                    spawns.push({ time: 5.0 + i * 2.8, type: 'bloater' });
                }
                spawns.push({ time: 8.0, type: 'civilian' });
                spawns.push({ time: 14.0, type: 'civilian' });
                spawns.push({ time: 20.0, type: 'civilian' });
            }
        } else {
            // Endless Scaling
            const scale = waveNum - 5;
            const shamblerCount = 25 + scale * 8;
            const sprinterCount = 10 + scale * 4;
            const bloaterCount = 6 + scale * 2;
            const bruteCount = 1 + Math.floor(scale / 2);

            for (let i = 0; i < bruteCount; i++) {
                spawns.push({ time: 1.0 + i * 10, type: 'brute' });
            }
            for (let i = 0; i < shamblerCount; i++) {
                spawns.push({ time: i * (0.8 / (1 + scale * 0.1)), type: 'shambler' });
            }
            for (let i = 0; i < sprinterCount; i++) {
                spawns.push({ time: 2.0 + i * 1.6, type: 'sprinter' });
            }
            for (let i = 0; i < bloaterCount; i++) {
                spawns.push({ time: 3.0 + i * 2.5, type: 'bloater' });
            }
            for (let i = 0; i < 4; i++) {
                spawns.push({ time: 5.0 + i * 7.0, type: 'civilian' });
            }
        }

        // Sort by spawn time
        spawns.sort((a, b) => a.time - b.time);
        return spawns;
    }

    update(dt) {
        if (!this.waveInProgress) return false;

        this.waveTimer += dt;

        // Check spawns
        while (this.spawnQueue.length > 0 && this.spawnQueue[0].time <= this.waveTimer) {
            const nextSpawn = this.spawnQueue.shift();
            const spawnX = this.spawnXMin + Math.random() * (this.spawnXMax - this.spawnXMin);
            this.em.spawnEntity(nextSpawn.type, spawnX, this.spawnZ);
        }

        // Wave is completed when spawn queue is empty and all active entities are resolved
        if (this.spawnQueue.length === 0 && this.em.entities.length === 0) {
            this.waveInProgress = false;
            return true; // Wave complete!
        }

        return false;
    }
}
