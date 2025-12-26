/**
 * Characters System for Primal Hunt
 * Defines Hunter and Monster characters
 */

/**
 * Base Entity class
 */
class Entity {
    constructor(x, y, config) {
        this.id = Utils.generateId();
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.width = config.width || 40;
        this.height = config.height || 40;
        this.radius = config.radius || 20;

        this.maxHealth = config.maxHealth || 100;
        this.health = this.maxHealth;
        this.maxEnergy = config.maxEnergy || 100;
        this.energy = this.maxEnergy;
        this.energyRegen = config.energyRegen || 5;

        this.speed = config.speed || 150;
        this.baseSpeed = this.speed;
        this.damage = config.damage || 10;
        this.armor = config.armor || 0;

        this.team = config.team || 'neutral';
        this.isPlayer = config.isPlayer || false;
        this.isAlive = true;
        this.isDowned = false;

        this.buffs = [];
        this.debuffs = [];

        this.direction = { x: 0, y: 1 };
        this.facingAngle = 0;

        this.abilities = {};
        this.color = config.color || '#ffffff';
        this.icon = config.icon || '?';
    }

    update(dt, game) {
        if (!this.isAlive) return;

        // Update buffs and debuffs
        this.updateBuffs(dt);
        this.updateDebuffs(dt);

        // Update abilities cooldowns
        for (const key in this.abilities) {
            this.abilities[key].update(dt);
        }

        // Energy regeneration
        this.energy = Math.min(this.maxEnergy, this.energy + this.energyRegen * dt);

        // Apply movement
        const speedMod = this.getSpeedMultiplier();
        this.x += this.vx * speedMod * dt;
        this.y += this.vy * speedMod * dt;

        // Update facing direction
        if (this.vx !== 0 || this.vy !== 0) {
            this.facingAngle = Math.atan2(this.vy, this.vx);
            this.direction = Utils.normalize(this.vx, this.vy);
        }
    }

    takeDamage(amount, attacker) {
        if (!this.isAlive) return;

        // Check for shield buff
        const shieldBuff = this.buffs.find(b => b.shield);
        if (shieldBuff) {
            if (shieldBuff.shield >= amount) {
                shieldBuff.shield -= amount;
                return;
            } else {
                amount -= shieldBuff.shield;
                shieldBuff.shield = 0;
            }
        }

        // Apply armor reduction
        const actualDamage = Math.max(1, amount * (1 - this.armor * 0.01));
        this.health -= actualDamage;

        Audio.play('damage');
        Utils.vibrate(50);

        if (this.health <= 0) {
            this.health = 0;
            this.onDeath(attacker);
        }

        return actualDamage;
    }

    heal(amount) {
        if (!this.isAlive) return;
        this.health = Math.min(this.maxHealth, this.health + amount);
        Audio.play('heal');
    }

    onDeath(killer) {
        this.isAlive = false;
        this.isDowned = true;
    }

    revive() {
        this.isAlive = true;
        this.isDowned = false;
        this.health = this.maxHealth * 0.5;
    }

    addBuff(buff) {
        // Remove existing buff of same type
        this.buffs = this.buffs.filter(b => b.id !== buff.id);
        this.buffs.push({ ...buff, remaining: buff.duration });
    }

    addDebuff(debuff) {
        this.debuffs = this.debuffs.filter(d => d.id !== debuff.id);
        this.debuffs.push({ ...debuff, remaining: debuff.duration });
    }

    updateBuffs(dt) {
        this.buffs = this.buffs.filter(buff => {
            buff.remaining -= dt;
            return buff.remaining > 0;
        });
    }

    updateDebuffs(dt) {
        this.debuffs = this.debuffs.filter(debuff => {
            debuff.remaining -= dt;
            return debuff.remaining > 0;
        });
    }

    getSpeedMultiplier() {
        let mult = 1;
        this.buffs.forEach(b => {
            if (b.speedMultiplier) mult *= b.speedMultiplier;
        });
        this.debuffs.forEach(d => {
            if (d.speedMultiplier) mult *= d.speedMultiplier;
        });
        return mult;
    }

    getDamageMultiplier() {
        let mult = 1;
        this.buffs.forEach(b => {
            if (b.damageMultiplier) mult *= b.damageMultiplier;
        });
        return mult;
    }

    isInvisible() {
        return this.buffs.some(b => b.invisible);
    }

    isImmobilized() {
        return this.debuffs.some(d => d.immobilized);
    }

    render(ctx, camera) {
        if (!this.isAlive && !this.isDowned) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // Don't render if invisible (unless it's the player)
        if (this.isInvisible() && !this.isPlayer) {
            return;
        }

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(screenX, screenY + this.radius * 0.8, this.radius * 0.8, this.radius * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        const alpha = this.isInvisible() ? 0.3 : 1;
        ctx.globalAlpha = alpha;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = this.isDowned ? '#ff0000' : 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Icon
        ctx.fillStyle = '#ffffff';
        ctx.font = `${this.radius}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icon, screenX, screenY);

        // Direction indicator
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(
            screenX + Math.cos(this.facingAngle) * (this.radius + 10),
            screenY + Math.sin(this.facingAngle) * (this.radius + 10)
        );
        ctx.stroke();

        ctx.globalAlpha = 1;

        // Health bar (for non-players or when damaged)
        if (this.health < this.maxHealth || !this.isPlayer) {
            this.renderHealthBar(ctx, screenX, screenY);
        }

        // Render buffs/debuffs indicators
        this.renderStatusEffects(ctx, screenX, screenY);
    }

    renderHealthBar(ctx, screenX, screenY) {
        const barWidth = this.radius * 2;
        const barHeight = 6;
        const barY = screenY - this.radius - 15;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);

        // Health
        const healthPercent = this.health / this.maxHealth;
        const healthColor = healthPercent > 0.5 ? '#2ed573' : healthPercent > 0.25 ? '#ffa502' : '#ff4757';
        ctx.fillStyle = healthColor;
        ctx.fillRect(screenX - barWidth / 2, barY, barWidth * healthPercent, barHeight);

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX - barWidth / 2, barY, barWidth, barHeight);
    }

    renderStatusEffects(ctx, screenX, screenY) {
        const effectY = screenY - this.radius - 25;
        let offsetX = 0;

        // Render buff icons
        this.buffs.forEach((buff, i) => {
            ctx.fillStyle = buff.color || '#00ff00';
            ctx.beginPath();
            ctx.arc(screenX - 20 + offsetX, effectY, 5, 0, Math.PI * 2);
            ctx.fill();
            offsetX += 12;
        });

        // Render debuff icons
        this.debuffs.forEach((debuff, i) => {
            ctx.fillStyle = debuff.color || '#ff0000';
            ctx.beginPath();
            ctx.arc(screenX - 20 + offsetX, effectY, 5, 0, Math.PI * 2);
            ctx.fill();
            offsetX += 12;
        });
    }
}

/**
 * Hunter class
 */
class Hunter extends Entity {
    constructor(x, y, hunterData, isPlayer = false) {
        super(x, y, {
            ...hunterData.stats,
            team: 'hunters',
            isPlayer,
            color: hunterData.color,
            icon: hunterData.icon
        });

        this.name = hunterData.name;
        this.role = hunterData.role;
        this.description = hunterData.description;
        this.hunterClass = hunterData.id;

        // Clone abilities
        const abilitySet = getAbilitiesForCharacter('hunter', hunterData.id);
        if (abilitySet) {
            this.abilities = cloneAbilities(abilitySet);
        }

        this.jetpackFuel = 100;
        this.maxJetpackFuel = 100;
        this.jetpackActive = false;
    }

    update(dt, game) {
        super.update(dt, game);

        // Jetpack fuel regeneration
        if (!this.jetpackActive) {
            this.jetpackFuel = Math.min(this.maxJetpackFuel, this.jetpackFuel + 20 * dt);
        }
    }

    useJetpack(dt) {
        if (this.jetpackFuel > 0) {
            this.jetpackActive = true;
            this.jetpackFuel -= 30 * dt;
            return true;
        }
        this.jetpackActive = false;
        return false;
    }
}

/**
 * Monster class
 */
class Monster extends Entity {
    constructor(x, y, monsterData, isPlayer = false) {
        super(x, y, {
            ...monsterData.stats,
            team: 'monster',
            isPlayer,
            color: monsterData.color,
            icon: monsterData.icon
        });

        this.name = monsterData.name;
        this.description = monsterData.description;
        this.monsterType = monsterData.id;

        // Evolution system - increased threshold for longer games
        this.evolutionStage = 1;
        this.maxEvolutionStage = 3;
        this.evolutionProgress = 0;
        this.evolutionThreshold = 200;

        // Store evolution multipliers
        this.evolutionMultipliers = monsterData.evolutionMultipliers || {
            health: 1.5,
            damage: 1.4,
            armor: 1.3,
            speed: 1.1,
            size: 1.2
        };

        // Clone abilities
        const abilitySet = getAbilitiesForCharacter('monster', monsterData.id);
        if (abilitySet) {
            this.abilities = cloneAbilities(abilitySet);
        }

        // Special monster attributes
        this.smell = 100; // Detecting range
        this.stealthMode = false;
    }

    update(dt, game) {
        super.update(dt, game);
    }

    feed(foodValue) {
        this.evolutionProgress += foodValue;

        if (this.evolutionProgress >= this.evolutionThreshold && this.evolutionStage < this.maxEvolutionStage) {
            this.evolve();
        }
    }

    evolve() {
        if (this.evolutionStage >= this.maxEvolutionStage) return false;

        this.evolutionStage++;
        this.evolutionProgress = 0;
        this.evolutionThreshold *= 1.5;

        // Apply evolution bonuses
        const mult = this.evolutionMultipliers;
        this.maxHealth *= mult.health;
        this.health = this.maxHealth;
        this.damage *= mult.damage;
        this.armor += 5;
        this.speed *= mult.speed;
        this.radius *= mult.size;

        // Upgrade abilities
        for (const key in this.abilities) {
            this.abilities[key].upgrade();
        }

        Audio.play('evolve');
        Audio.play('roar');
        Utils.vibrate([100, 50, 100]);

        return true;
    }

    getEvolutionPercent() {
        return (this.evolutionProgress / this.evolutionThreshold) * 100;
    }

    toggleStealth() {
        this.stealthMode = !this.stealthMode;
        if (this.stealthMode) {
            this.speed *= 0.5;
        } else {
            this.speed = this.baseSpeed;
        }
    }

    render(ctx, camera) {
        // Monster has larger, more menacing rendering
        if (!this.isAlive && !this.isDowned) return;

        const screenX = this.x - camera.x;
        const screenY = this.y - camera.y;

        // Evolution glow based on stage
        if (this.evolutionStage > 1) {
            const glowRadius = this.radius + 10 * this.evolutionStage;
            const gradient = ctx.createRadialGradient(screenX, screenY, this.radius, screenX, screenY, glowRadius);
            gradient.addColorStop(0, `${this.color}66`);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(screenX, screenY, glowRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Call parent render
        super.render(ctx, camera);

        // Evolution stage indicator
        ctx.fillStyle = '#9b59b6';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Stage ${this.evolutionStage}`, screenX, screenY + this.radius + 20);
    }
}

/**
 * Wildlife (food for monster)
 */
class Wildlife extends Entity {
    constructor(x, y, type) {
        const wildlifeTypes = {
            small: { health: 20, foodValue: 15, speed: 80, radius: 12, color: '#8B4513', icon: '🐀' },
            medium: { health: 50, foodValue: 30, speed: 60, radius: 18, color: '#654321', icon: '🦌' },
            large: { health: 100, foodValue: 50, speed: 40, radius: 25, color: '#4a3728', icon: '🦬' }
        };

        const data = wildlifeTypes[type] || wildlifeTypes.small;

        super(x, y, {
            ...data,
            team: 'wildlife'
        });

        this.type = type;
        this.foodValue = data.foodValue;
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.wanderTimer = 0;
        this.fleeTarget = null;
        this.state = 'wander';
    }

    update(dt, game) {
        super.update(dt, game);

        // Simple AI - wander and flee from threats
        this.wanderTimer -= dt;

        if (this.fleeTarget && this.fleeTarget.isAlive) {
            const dist = Utils.distance(this.x, this.y, this.fleeTarget.x, this.fleeTarget.y);
            if (dist < 200) {
                // Flee
                const angle = Utils.angle(this.fleeTarget.x, this.fleeTarget.y, this.x, this.y);
                this.vx = Math.cos(angle) * this.speed;
                this.vy = Math.sin(angle) * this.speed;
                this.state = 'flee';
            } else {
                this.fleeTarget = null;
                this.state = 'wander';
            }
        } else {
            // Wander
            if (this.wanderTimer <= 0) {
                this.wanderAngle += (Math.random() - 0.5) * Math.PI;
                this.wanderTimer = Utils.random(1, 3);
            }

            this.vx = Math.cos(this.wanderAngle) * this.speed * 0.5;
            this.vy = Math.sin(this.wanderAngle) * this.speed * 0.5;
        }
    }

    flee(threat) {
        this.fleeTarget = threat;
        this.state = 'flee';
    }
}

/**
 * Hunter class definitions
 */
const HunterClasses = {
    assault: {
        id: 'assault',
        name: 'ASSAULT',
        role: 'Damage Dealer',
        description: 'High damage output with explosives and assault weapons.',
        icon: '🎯',
        color: '#e74c3c',
        stats: {
            maxHealth: 250,
            maxEnergy: 100,
            speed: 160,
            damage: 8,
            armor: 15,
            radius: 20
        }
    },
    trapper: {
        id: 'trapper',
        name: 'TRAPPER',
        role: 'Control Specialist',
        description: 'Controls the battlefield with traps and slowing effects.',
        icon: '🪤',
        color: '#2ecc71',
        stats: {
            maxHealth: 220,
            maxEnergy: 120,
            speed: 170,
            damage: 5,
            armor: 10,
            radius: 18
        }
    },
    medic: {
        id: 'medic',
        name: 'MEDIC',
        role: 'Healer',
        description: 'Keeps the team alive with powerful healing abilities.',
        icon: '💉',
        color: '#3498db',
        stats: {
            maxHealth: 200,
            maxEnergy: 150,
            speed: 165,
            damage: 4,
            armor: 10,
            radius: 18
        }
    },
    support: {
        id: 'support',
        name: 'SUPPORT',
        role: 'Buffer/Utility',
        description: 'Provides shields, cloaking, and orbital strikes.',
        icon: '🛡️',
        color: '#9b59b6',
        stats: {
            maxHealth: 230,
            maxEnergy: 130,
            speed: 155,
            damage: 6,
            armor: 12,
            radius: 19
        }
    }
};

/**
 * Monster type definitions
 */
const MonsterTypes = {
    goliath: {
        id: 'goliath',
        name: 'GOLIATH',
        description: 'A massive beast built for direct combat. Uses brute strength and fire.',
        icon: '👹',
        color: '#8B0000',
        stats: {
            maxHealth: 500,
            maxEnergy: 100,
            speed: 130,
            damage: 12,
            armor: 20,
            radius: 35
        },
        evolutionMultipliers: {
            health: 1.3,
            damage: 1.25,
            armor: 1.15,
            speed: 1.05,
            size: 1.1
        }
    },
    kraken: {
        id: 'kraken',
        name: 'KRAKEN',
        description: 'A flying nightmare that attacks from range with lightning.',
        icon: '🦑',
        color: '#4B0082',
        stats: {
            maxHealth: 400,
            maxEnergy: 150,
            speed: 160,
            damage: 10,
            armor: 10,
            radius: 30
        },
        evolutionMultipliers: {
            health: 1.25,
            damage: 1.3,
            armor: 1.1,
            speed: 1.08,
            size: 1.08
        }
    },
    wraith: {
        id: 'wraith',
        name: 'WRAITH',
        description: 'A stealthy assassin that warps through space to strike.',
        icon: '👻',
        color: '#800080',
        stats: {
            maxHealth: 350,
            maxEnergy: 120,
            speed: 180,
            damage: 9,
            armor: 5,
            radius: 25
        },
        evolutionMultipliers: {
            health: 1.2,
            damage: 1.25,
            armor: 1.1,
            speed: 1.1,
            size: 1.08
        }
    },
    behemoth: {
        id: 'behemoth',
        name: 'BEHEMOTH',
        description: 'An unstoppable juggernaut that rolls through obstacles.',
        icon: '🦣',
        color: '#654321',
        stats: {
            maxHealth: 700,
            maxEnergy: 80,
            speed: 90,
            damage: 15,
            armor: 30,
            radius: 45
        },
        evolutionMultipliers: {
            health: 1.35,
            damage: 1.2,
            armor: 1.2,
            speed: 1.03,
            size: 1.12
        }
    }
};

// Export
window.Entity = Entity;
window.Hunter = Hunter;
window.Monster = Monster;
window.Wildlife = Wildlife;
window.HunterClasses = HunterClasses;
window.MonsterTypes = MonsterTypes;
