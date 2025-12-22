/**
 * Map System for Primal Hunt
 * Procedurally generated arenas with terrain, obstacles, and wildlife
 */

const TerrainType = {
    GROUND: 0,
    WATER: 1,
    ROCK: 2,
    FOREST: 3,
    CAVE: 4
};

/**
 * Map Generator
 */
class GameMap {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.tileSize = 40;
        this.cols = Math.ceil(width / this.tileSize);
        this.rows = Math.ceil(height / this.tileSize);

        this.terrain = [];
        this.obstacles = [];
        this.spawnPoints = {
            hunters: [],
            monster: null,
            wildlife: []
        };

        this.generate();
    }

    generate() {
        // Initialize terrain grid
        for (let y = 0; y < this.rows; y++) {
            this.terrain[y] = [];
            for (let x = 0; x < this.cols; x++) {
                this.terrain[y][x] = TerrainType.GROUND;
            }
        }

        // Generate terrain features using noise-like algorithm
        this.generateTerrain();

        // Add obstacles (rocks, trees)
        this.generateObstacles();

        // Set spawn points
        this.setSpawnPoints();

        // Add wildlife spawn locations
        this.generateWildlifeSpawns();
    }

    generateTerrain() {
        // Create water bodies
        const waterCount = Utils.randomInt(2, 4);
        for (let i = 0; i < waterCount; i++) {
            const cx = Utils.randomInt(5, this.cols - 5);
            const cy = Utils.randomInt(5, this.rows - 5);
            const radius = Utils.randomInt(3, 6);

            for (let y = -radius; y <= radius; y++) {
                for (let x = -radius; x <= radius; x++) {
                    if (x * x + y * y <= radius * radius) {
                        const tx = cx + x;
                        const ty = cy + y;
                        if (this.isValidTile(tx, ty)) {
                            this.terrain[ty][tx] = TerrainType.WATER;
                        }
                    }
                }
            }
        }

        // Create forest areas
        const forestCount = Utils.randomInt(3, 6);
        for (let i = 0; i < forestCount; i++) {
            const cx = Utils.randomInt(3, this.cols - 3);
            const cy = Utils.randomInt(3, this.rows - 3);
            const radius = Utils.randomInt(4, 8);

            for (let y = -radius; y <= radius; y++) {
                for (let x = -radius; x <= radius; x++) {
                    const dist = Math.sqrt(x * x + y * y);
                    if (dist <= radius && Math.random() > 0.3) {
                        const tx = cx + x;
                        const ty = cy + y;
                        if (this.isValidTile(tx, ty) && this.terrain[ty][tx] === TerrainType.GROUND) {
                            this.terrain[ty][tx] = TerrainType.FOREST;
                        }
                    }
                }
            }
        }

        // Create cave/dark areas
        const caveCount = Utils.randomInt(1, 3);
        for (let i = 0; i < caveCount; i++) {
            const cx = Utils.randomInt(5, this.cols - 5);
            const cy = Utils.randomInt(5, this.rows - 5);
            const radius = Utils.randomInt(2, 4);

            for (let y = -radius; y <= radius; y++) {
                for (let x = -radius; x <= radius; x++) {
                    if (x * x + y * y <= radius * radius) {
                        const tx = cx + x;
                        const ty = cy + y;
                        if (this.isValidTile(tx, ty) && this.terrain[ty][tx] === TerrainType.GROUND) {
                            this.terrain[ty][tx] = TerrainType.CAVE;
                        }
                    }
                }
            }
        }
    }

    generateObstacles() {
        // Add rock obstacles
        const rockCount = Utils.randomInt(15, 30);
        for (let i = 0; i < rockCount; i++) {
            const x = Utils.random(50, this.width - 50);
            const y = Utils.random(50, this.height - 50);
            const radius = Utils.random(15, 40);

            // Check if valid position
            const tile = this.getTileAt(x, y);
            if (tile === TerrainType.GROUND || tile === TerrainType.FOREST) {
                this.obstacles.push({
                    type: 'rock',
                    x, y,
                    radius,
                    color: `hsl(${Utils.randomInt(20, 40)}, 20%, ${Utils.randomInt(25, 40)}%)`
                });
            }
        }

        // Add trees in forest areas
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.terrain[y][x] === TerrainType.FOREST && Math.random() > 0.7) {
                    const worldX = x * this.tileSize + this.tileSize / 2;
                    const worldY = y * this.tileSize + this.tileSize / 2;
                    this.obstacles.push({
                        type: 'tree',
                        x: worldX + Utils.random(-10, 10),
                        y: worldY + Utils.random(-10, 10),
                        radius: Utils.random(10, 20),
                        height: Utils.random(40, 80)
                    });
                }
            }
        }
    }

    setSpawnPoints() {
        // Hunter spawn points (one side of map)
        for (let i = 0; i < 4; i++) {
            this.spawnPoints.hunters.push({
                x: 100 + i * 60,
                y: 100 + i * 40
            });
        }

        // Monster spawn point (opposite side)
        this.spawnPoints.monster = {
            x: this.width - 150,
            y: this.height - 150
        };
    }

    generateWildlifeSpawns() {
        // Distribute wildlife spawn points
        const count = Utils.randomInt(10, 20);
        for (let i = 0; i < count; i++) {
            const x = Utils.random(100, this.width - 100);
            const y = Utils.random(100, this.height - 100);

            const tile = this.getTileAt(x, y);
            if (tile !== TerrainType.WATER && tile !== TerrainType.ROCK) {
                // Determine wildlife type based on terrain
                let type = 'small';
                if (tile === TerrainType.FOREST) {
                    type = Math.random() > 0.5 ? 'medium' : 'small';
                } else if (tile === TerrainType.CAVE) {
                    type = Math.random() > 0.7 ? 'large' : 'medium';
                } else {
                    type = Math.random() > 0.8 ? 'medium' : 'small';
                }

                this.spawnPoints.wildlife.push({ x, y, type });
            }
        }
    }

    isValidTile(x, y) {
        return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
    }

    getTileAt(worldX, worldY) {
        const tileX = Math.floor(worldX / this.tileSize);
        const tileY = Math.floor(worldY / this.tileSize);

        if (!this.isValidTile(tileX, tileY)) {
            return TerrainType.ROCK; // Out of bounds is impassable
        }

        return this.terrain[tileY][tileX];
    }

    isPassable(x, y, entity) {
        const tile = this.getTileAt(x, y);

        // Water is only passable for flying creatures
        if (tile === TerrainType.WATER) {
            return entity && entity.canFly;
        }

        // Check obstacles
        for (const obs of this.obstacles) {
            if (obs.type === 'rock') {
                const dist = Utils.distance(x, y, obs.x, obs.y);
                if (dist < obs.radius + (entity ? entity.radius : 15)) {
                    return false;
                }
            }
        }

        return tile !== TerrainType.ROCK;
    }

    getObstacleCollision(x, y, radius) {
        for (const obs of this.obstacles) {
            if (obs.type === 'rock' || obs.type === 'tree') {
                const dist = Utils.distance(x, y, obs.x, obs.y);
                if (dist < obs.radius + radius) {
                    return obs;
                }
            }
        }
        return null;
    }

    constrainToMap(x, y, radius) {
        return {
            x: Utils.clamp(x, radius, this.width - radius),
            y: Utils.clamp(y, radius, this.height - radius)
        };
    }

    render(ctx, camera, canvasWidth, canvasHeight) {
        // Calculate visible tile range
        const startCol = Math.max(0, Math.floor(camera.x / this.tileSize));
        const endCol = Math.min(this.cols, Math.ceil((camera.x + canvasWidth) / this.tileSize));
        const startRow = Math.max(0, Math.floor(camera.y / this.tileSize));
        const endRow = Math.min(this.rows, Math.ceil((camera.y + canvasHeight) / this.tileSize));

        // Render terrain tiles
        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
                const screenX = x * this.tileSize - camera.x;
                const screenY = y * this.tileSize - camera.y;
                const tile = this.terrain[y][x];

                ctx.fillStyle = this.getTileColor(tile);
                ctx.fillRect(screenX, screenY, this.tileSize + 1, this.tileSize + 1);

                // Add tile variation
                if (tile === TerrainType.GROUND || tile === TerrainType.FOREST) {
                    this.renderGroundDetail(ctx, screenX, screenY, x, y);
                }
            }
        }

        // Render obstacles
        this.renderObstacles(ctx, camera);
    }

    getTileColor(tile) {
        switch (tile) {
            case TerrainType.GROUND:
                return '#2d5016';
            case TerrainType.WATER:
                return '#1a4d7a';
            case TerrainType.ROCK:
                return '#4a4a4a';
            case TerrainType.FOREST:
                return '#1a3d0c';
            case TerrainType.CAVE:
                return '#1a1a2e';
            default:
                return '#2d5016';
        }
    }

    renderGroundDetail(ctx, screenX, screenY, tileX, tileY) {
        // Use tile coords as seed for consistent detail
        const seed = tileX * 1000 + tileY;
        const rng = (n) => {
            const x = Math.sin(seed + n) * 10000;
            return x - Math.floor(x);
        };

        // Grass tufts
        if (rng(1) > 0.7) {
            ctx.fillStyle = 'rgba(60, 120, 30, 0.5)';
            ctx.beginPath();
            ctx.arc(
                screenX + rng(2) * this.tileSize,
                screenY + rng(3) * this.tileSize,
                3,
                0, Math.PI * 2
            );
            ctx.fill();
        }
    }

    renderObstacles(ctx, camera) {
        for (const obs of this.obstacles) {
            const screenX = obs.x - camera.x;
            const screenY = obs.y - camera.y;

            if (obs.type === 'rock') {
                // Rock shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.beginPath();
                ctx.ellipse(screenX, screenY + obs.radius * 0.5, obs.radius, obs.radius * 0.3, 0, 0, Math.PI * 2);
                ctx.fill();

                // Rock body
                ctx.fillStyle = obs.color;
                ctx.beginPath();
                ctx.arc(screenX, screenY, obs.radius, 0, Math.PI * 2);
                ctx.fill();

                // Highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.beginPath();
                ctx.arc(screenX - obs.radius * 0.3, screenY - obs.radius * 0.3, obs.radius * 0.4, 0, Math.PI * 2);
                ctx.fill();
            } else if (obs.type === 'tree') {
                // Tree shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.beginPath();
                ctx.ellipse(screenX, screenY + 10, obs.radius * 1.5, obs.radius * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();

                // Trunk
                ctx.fillStyle = '#4a3728';
                ctx.fillRect(screenX - 5, screenY - obs.height * 0.3, 10, obs.height * 0.5);

                // Foliage
                ctx.fillStyle = '#2d5a1e';
                ctx.beginPath();
                ctx.arc(screenX, screenY - obs.height * 0.5, obs.radius * 1.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#3d7a2e';
                ctx.beginPath();
                ctx.arc(screenX - 5, screenY - obs.height * 0.6, obs.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    renderMinimap(ctx, entities, player, width, height) {
        const scale = Math.min(width / this.width, height / this.height);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);

        // Terrain (simplified)
        for (let y = 0; y < this.rows; y += 3) {
            for (let x = 0; x < this.cols; x += 3) {
                const tile = this.terrain[y][x];
                ctx.fillStyle = this.getMinimapTileColor(tile);
                ctx.fillRect(
                    x * this.tileSize * scale,
                    y * this.tileSize * scale,
                    this.tileSize * 3 * scale,
                    this.tileSize * 3 * scale
                );
            }
        }

        // Entities
        for (const entity of entities) {
            if (!entity.isAlive) continue;

            // Skip invisible enemies
            if (entity.isInvisible() && entity.team !== player.team && entity !== player) continue;

            if (entity === player) {
                ctx.fillStyle = '#00ff00';
            } else if (entity.team === player.team) {
                ctx.fillStyle = '#00aaff';
            } else if (entity.team === 'monster') {
                ctx.fillStyle = '#ff0000';
            } else if (entity.team === 'wildlife') {
                ctx.fillStyle = '#ffaa00';
            } else {
                ctx.fillStyle = '#ffffff';
            }

            ctx.beginPath();
            ctx.arc(
                entity.x * scale,
                entity.y * scale,
                entity === player ? 4 : 3,
                0, Math.PI * 2
            );
            ctx.fill();
        }

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, width, height);
    }

    getMinimapTileColor(tile) {
        switch (tile) {
            case TerrainType.GROUND:
                return '#4a7d2a';
            case TerrainType.WATER:
                return '#2a6090';
            case TerrainType.ROCK:
                return '#5a5a5a';
            case TerrainType.FOREST:
                return '#2a5a1a';
            case TerrainType.CAVE:
                return '#2a2a4a';
            default:
                return '#4a7d2a';
        }
    }
}

/**
 * Camera class for viewport management
 */
class Camera {
    constructor(width, height) {
        this.x = 0;
        this.y = 0;
        this.width = width;
        this.height = height;
        this.targetX = 0;
        this.targetY = 0;
        this.smoothing = 0.1;
        this.bounds = null;
    }

    follow(entity) {
        this.targetX = entity.x - this.width / 2;
        this.targetY = entity.y - this.height / 2;
    }

    update(dt) {
        // Smooth camera movement
        this.x = Utils.lerp(this.x, this.targetX, this.smoothing);
        this.y = Utils.lerp(this.y, this.targetY, this.smoothing);

        // Constrain to bounds
        if (this.bounds) {
            this.x = Utils.clamp(this.x, 0, this.bounds.width - this.width);
            this.y = Utils.clamp(this.y, 0, this.bounds.height - this.height);
        }
    }

    setBounds(width, height) {
        this.bounds = { width, height };
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
    }

    screenToWorld(screenX, screenY) {
        return {
            x: screenX + this.x,
            y: screenY + this.y
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.x,
            y: worldY - this.y
        };
    }

    isOnScreen(x, y, margin = 50) {
        return x > this.x - margin &&
               x < this.x + this.width + margin &&
               y > this.y - margin &&
               y < this.y + this.height + margin;
    }
}

// Export
window.TerrainType = TerrainType;
window.GameMap = GameMap;
window.Camera = Camera;
