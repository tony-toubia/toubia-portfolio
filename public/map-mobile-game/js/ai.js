/**
 * AI System for Primal Hunt
 * Controls monster and hunter AI behavior
 */

const AIState = {
    IDLE: 'idle',
    PATROL: 'patrol',
    CHASE: 'chase',
    ATTACK: 'attack',
    FLEE: 'flee',
    FEED: 'feed',
    EVOLVE: 'evolve',
    SUPPORT: 'support',
    HEAL: 'heal'
};

/**
 * Base AI Controller
 */
class AIController {
    constructor(entity) {
        this.entity = entity;
        this.state = AIState.IDLE;
        this.target = null;
        this.lastStateChange = 0;
        this.stateTimer = 0;
        this.thinkTimer = 0;
        this.thinkInterval = 0.2; // How often to reconsider actions
        this.path = [];
        this.pathIndex = 0;
    }

    update(dt, game) {
        this.stateTimer += dt;
        this.thinkTimer += dt;

        if (this.thinkTimer >= this.thinkInterval) {
            this.thinkTimer = 0;
            this.think(game);
        }

        this.executeState(dt, game);
    }

    think(game) {
        // Override in subclasses
    }

    executeState(dt, game) {
        // Override in subclasses
    }

    setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.stateTimer = 0;
            this.lastStateChange = Date.now();
        }
    }

    moveToward(targetX, targetY, speed) {
        const angle = Utils.angle(this.entity.x, this.entity.y, targetX, targetY);
        this.entity.vx = Math.cos(angle) * speed;
        this.entity.vy = Math.sin(angle) * speed;
    }

    moveAway(targetX, targetY, speed) {
        const angle = Utils.angle(targetX, targetY, this.entity.x, this.entity.y);
        this.entity.vx = Math.cos(angle) * speed;
        this.entity.vy = Math.sin(angle) * speed;
    }

    stop() {
        this.entity.vx = 0;
        this.entity.vy = 0;
    }

    getDistanceToTarget() {
        if (!this.target) return Infinity;
        return Utils.distance(this.entity.x, this.entity.y, this.target.x, this.target.y);
    }

    canSeeTarget(game) {
        if (!this.target) return false;
        // Simple line of sight check
        return !this.target.isInvisible();
    }
}

/**
 * Monster AI Controller
 */
class MonsterAI extends AIController {
    constructor(entity, difficulty = 'normal') {
        super(entity);
        this.difficulty = difficulty;

        // Adjust AI parameters based on difficulty
        const difficultyMods = {
            easy: { aggressiveness: 0.3, accuracy: 0.6, reactionTime: 0.4 },
            normal: { aggressiveness: 0.5, accuracy: 0.8, reactionTime: 0.25 },
            hard: { aggressiveness: 0.8, accuracy: 0.95, reactionTime: 0.15 }
        };

        this.mods = difficultyMods[difficulty] || difficultyMods.normal;
        this.aggressiveness = this.mods.aggressiveness;

        this.huntingTarget = null;
        this.feedingTarget = null;
        this.lastAbilityUse = 0;
        this.abilityDelay = 1.5;
    }

    think(game) {
        const hunters = game.getAliveHunters();
        const wildlife = game.getAliveWildlife();

        // Find nearest hunter
        let nearestHunter = null;
        let nearestHunterDist = Infinity;

        for (const hunter of hunters) {
            if (hunter.isInvisible()) continue;
            const dist = Utils.distance(this.entity.x, this.entity.y, hunter.x, hunter.y);
            if (dist < nearestHunterDist) {
                nearestHunterDist = dist;
                nearestHunter = hunter;
            }
        }

        // Find nearest wildlife for feeding
        let nearestWildlife = null;
        let nearestWildlifeDist = Infinity;

        for (const animal of wildlife) {
            const dist = Utils.distance(this.entity.x, this.entity.y, animal.x, animal.y);
            if (dist < nearestWildlifeDist) {
                nearestWildlifeDist = dist;
                nearestWildlife = animal;
            }
        }

        // Decide what to do based on evolution stage and situation
        const stage = this.entity.evolutionStage;
        const healthPercent = this.entity.health / this.entity.maxHealth;

        // Low health - flee and feed
        if (healthPercent < 0.3 && stage < 3) {
            if (nearestHunterDist < 200) {
                this.setState(AIState.FLEE);
                this.target = nearestHunter;
            } else if (nearestWildlife) {
                this.setState(AIState.FEED);
                this.target = nearestWildlife;
            }
            return;
        }

        // Early game - focus on feeding and evolving
        if (stage === 1) {
            if (nearestHunterDist < 150) {
                // Too close, flee or fight
                if (Math.random() < this.aggressiveness) {
                    this.setState(AIState.ATTACK);
                    this.target = nearestHunter;
                } else {
                    this.setState(AIState.FLEE);
                    this.target = nearestHunter;
                }
            } else if (nearestWildlife && nearestWildlifeDist < 300) {
                this.setState(AIState.FEED);
                this.target = nearestWildlife;
            } else {
                this.setState(AIState.PATROL);
            }
            return;
        }

        // Mid game - balance feeding and fighting
        if (stage === 2) {
            if (nearestHunterDist < 250 && Math.random() < this.aggressiveness) {
                this.setState(AIState.ATTACK);
                this.target = nearestHunter;
            } else if (nearestWildlife && this.entity.getEvolutionPercent() < 80) {
                this.setState(AIState.FEED);
                this.target = nearestWildlife;
            } else if (nearestHunter) {
                this.setState(AIState.CHASE);
                this.target = nearestHunter;
            } else {
                this.setState(AIState.PATROL);
            }
            return;
        }

        // Final stage - hunt the hunters
        if (stage === 3) {
            if (nearestHunter) {
                if (nearestHunterDist < 100) {
                    this.setState(AIState.ATTACK);
                } else {
                    this.setState(AIState.CHASE);
                }
                this.target = nearestHunter;
            } else {
                this.setState(AIState.PATROL);
            }
        }
    }

    executeState(dt, game) {
        switch (this.state) {
            case AIState.IDLE:
                this.stop();
                break;

            case AIState.PATROL:
                this.patrol(dt, game);
                break;

            case AIState.CHASE:
                this.chase(dt, game);
                break;

            case AIState.ATTACK:
                this.attack(dt, game);
                break;

            case AIState.FLEE:
                this.flee(dt, game);
                break;

            case AIState.FEED:
                this.feed(dt, game);
                break;
        }
    }

    patrol(dt, game) {
        // Random wandering
        if (this.stateTimer > 2) {
            const angle = Math.random() * Math.PI * 2;
            this.entity.vx = Math.cos(angle) * this.entity.speed * 0.5;
            this.entity.vy = Math.sin(angle) * this.entity.speed * 0.5;
            this.stateTimer = 0;
        }
    }

    chase(dt, game) {
        if (!this.target || !this.target.isAlive) {
            this.setState(AIState.PATROL);
            return;
        }

        const dist = this.getDistanceToTarget();

        if (dist < 80) {
            this.setState(AIState.ATTACK);
            return;
        }

        this.moveToward(this.target.x, this.target.y, this.entity.speed);

        // Try to use gap-closing abilities
        this.tryUseAbility('ability2', game); // Leap/charge abilities
    }

    attack(dt, game) {
        if (!this.target || !this.target.isAlive) {
            this.setState(AIState.CHASE);
            return;
        }

        const dist = this.getDistanceToTarget();

        if (dist > 150) {
            this.setState(AIState.CHASE);
            return;
        }

        // Face target
        this.entity.facingAngle = Utils.angle(this.entity.x, this.entity.y, this.target.x, this.target.y);

        // Use abilities
        const now = Date.now() / 1000;
        if (now - this.lastAbilityUse > this.abilityDelay * this.mods.reactionTime) {
            if (dist < 60) {
                this.tryUseAbility('primary', game);
            } else if (dist < 150) {
                this.tryUseAbility('ability1', game); // Ranged ability
            }

            // Occasionally use special abilities
            if (Math.random() < 0.3) {
                const abilities = ['ability3', 'ability4'];
                this.tryUseAbility(Utils.randomPick(abilities), game);
            }

            this.lastAbilityUse = now;
        }

        // Move to optimal range
        if (dist > 50) {
            this.moveToward(this.target.x, this.target.y, this.entity.speed * 0.5);
        } else if (dist < 30) {
            this.moveAway(this.target.x, this.target.y, this.entity.speed * 0.3);
        } else {
            // Strafe
            const strafeAngle = this.entity.facingAngle + Math.PI / 2;
            this.entity.vx = Math.cos(strafeAngle) * this.entity.speed * 0.3;
            this.entity.vy = Math.sin(strafeAngle) * this.entity.speed * 0.3;
        }
    }

    flee(dt, game) {
        if (!this.target) {
            this.setState(AIState.PATROL);
            return;
        }

        const dist = this.getDistanceToTarget();

        if (dist > 400) {
            this.setState(AIState.PATROL);
            return;
        }

        this.moveAway(this.target.x, this.target.y, this.entity.speed);
    }

    feed(dt, game) {
        if (!this.target || !this.target.isAlive) {
            this.setState(AIState.PATROL);
            return;
        }

        const dist = this.getDistanceToTarget();

        if (dist < 50) {
            // Attack wildlife
            this.tryUseAbility('primary', game);
            this.stop();
        } else {
            this.moveToward(this.target.x, this.target.y, this.entity.speed);
        }

        // Wildlife was killed - try to feed
        if (!this.target.isAlive && this.target.foodValue) {
            this.entity.feed(this.target.foodValue);
            this.target = null;
            this.setState(AIState.PATROL);
        }
    }

    tryUseAbility(abilityKey, game) {
        const ability = this.entity.abilities[abilityKey];
        if (ability && ability.canUse(this.entity)) {
            const target = this.target || { x: this.entity.x + Math.cos(this.entity.facingAngle) * 100, y: this.entity.y + Math.sin(this.entity.facingAngle) * 100 };
            ability.use(this.entity, target, game);
            return true;
        }
        return false;
    }
}

/**
 * Hunter AI Controller
 */
class HunterAI extends AIController {
    constructor(entity, difficulty = 'normal') {
        super(entity);
        this.difficulty = difficulty;

        const difficultyMods = {
            easy: { accuracy: 0.5, reactionTime: 0.5, teamwork: 0.3 },
            normal: { accuracy: 0.7, reactionTime: 0.3, teamwork: 0.5 },
            hard: { accuracy: 0.9, reactionTime: 0.15, teamwork: 0.8 }
        };

        this.mods = difficultyMods[difficulty] || difficultyMods.normal;
        this.role = entity.role || 'assault';
        this.lastAbilityUse = 0;
        this.abilityDelay = 0.8;
    }

    think(game) {
        const monster = game.getMonster();
        const allies = game.getAliveHunters().filter(h => h !== this.entity);

        if (!monster || !monster.isAlive) {
            this.setState(AIState.PATROL);
            return;
        }

        const distToMonster = Utils.distance(this.entity.x, this.entity.y, monster.x, monster.y);
        const healthPercent = this.entity.health / this.entity.maxHealth;

        // Role-specific behavior
        switch (this.role) {
            case 'Damage Dealer':
                this.thinkAssault(monster, distToMonster, healthPercent, allies, game);
                break;
            case 'Control Specialist':
                this.thinkTrapper(monster, distToMonster, healthPercent, allies, game);
                break;
            case 'Healer':
                this.thinkMedic(monster, distToMonster, healthPercent, allies, game);
                break;
            case 'Buffer/Utility':
                this.thinkSupport(monster, distToMonster, healthPercent, allies, game);
                break;
            default:
                this.thinkAssault(monster, distToMonster, healthPercent, allies, game);
        }
    }

    thinkAssault(monster, dist, health, allies, game) {
        if (health < 0.3 && dist < 150) {
            this.setState(AIState.FLEE);
            this.target = monster;
        } else if (dist < 300 && !monster.isInvisible()) {
            this.setState(AIState.ATTACK);
            this.target = monster;
        } else {
            this.setState(AIState.CHASE);
            this.target = monster;
        }
    }

    thinkTrapper(monster, dist, health, allies, game) {
        if (health < 0.25) {
            this.setState(AIState.FLEE);
            this.target = monster;
        } else if (dist < 250) {
            this.setState(AIState.ATTACK);
            this.target = monster;
        } else {
            this.setState(AIState.CHASE);
            this.target = monster;
        }
    }

    thinkMedic(monster, dist, health, allies, game) {
        // Find ally that needs healing
        const injuredAlly = allies.find(a => a.health / a.maxHealth < 0.6);

        if (injuredAlly) {
            this.setState(AIState.HEAL);
            this.target = injuredAlly;
        } else if (dist < 200) {
            this.setState(AIState.ATTACK);
            this.target = monster;
        } else {
            // Stay with team
            this.setState(AIState.SUPPORT);
            this.target = allies[0] || monster;
        }
    }

    thinkSupport(monster, dist, health, allies, game) {
        // Shield allies under attack
        const targetedAlly = allies.find(a => a.health / a.maxHealth < 0.5);

        if (targetedAlly && Math.random() < this.mods.teamwork) {
            this.setState(AIState.SUPPORT);
            this.target = targetedAlly;
        } else if (dist < 250) {
            this.setState(AIState.ATTACK);
            this.target = monster;
        } else {
            this.setState(AIState.CHASE);
            this.target = monster;
        }
    }

    executeState(dt, game) {
        switch (this.state) {
            case AIState.IDLE:
                this.stop();
                break;

            case AIState.PATROL:
                this.patrol(dt, game);
                break;

            case AIState.CHASE:
                this.chase(dt, game);
                break;

            case AIState.ATTACK:
                this.attackMonster(dt, game);
                break;

            case AIState.FLEE:
                this.flee(dt, game);
                break;

            case AIState.SUPPORT:
                this.support(dt, game);
                break;

            case AIState.HEAL:
                this.heal(dt, game);
                break;
        }
    }

    patrol(dt, game) {
        if (this.stateTimer > 1.5) {
            const angle = Math.random() * Math.PI * 2;
            this.entity.vx = Math.cos(angle) * this.entity.speed * 0.3;
            this.entity.vy = Math.sin(angle) * this.entity.speed * 0.3;
            this.stateTimer = 0;
        }
    }

    chase(dt, game) {
        if (!this.target) {
            this.setState(AIState.PATROL);
            return;
        }

        const dist = this.getDistanceToTarget();
        const optimalRange = this.getOptimalRange();

        if (dist < optimalRange) {
            this.setState(AIState.ATTACK);
            return;
        }

        this.moveToward(this.target.x, this.target.y, this.entity.speed);
    }

    attackMonster(dt, game) {
        if (!this.target || !this.target.isAlive) {
            this.setState(AIState.PATROL);
            return;
        }

        const dist = this.getDistanceToTarget();
        const optimalRange = this.getOptimalRange();

        // Face target
        this.entity.facingAngle = Utils.angle(this.entity.x, this.entity.y, this.target.x, this.target.y);

        // Use abilities
        const now = Date.now() / 1000;
        if (now - this.lastAbilityUse > this.abilityDelay) {
            // Primary attack
            if (Math.random() < this.mods.accuracy) {
                this.tryUseAbility('primary', game);
            }

            // Special abilities occasionally
            if (Math.random() < 0.2) {
                this.tryUseAbility('secondary', game);
            }
            if (Math.random() < 0.1) {
                this.tryUseAbility('ability1', game);
            }

            this.lastAbilityUse = now;
        }

        // Maintain optimal range
        if (dist > optimalRange + 50) {
            this.moveToward(this.target.x, this.target.y, this.entity.speed * 0.5);
        } else if (dist < optimalRange - 30) {
            this.moveAway(this.target.x, this.target.y, this.entity.speed * 0.4);
        } else {
            // Strafe
            const time = Date.now() / 1000;
            const strafeDir = Math.sin(time * 2) > 0 ? 1 : -1;
            const strafeAngle = this.entity.facingAngle + (Math.PI / 2) * strafeDir;
            this.entity.vx = Math.cos(strafeAngle) * this.entity.speed * 0.3;
            this.entity.vy = Math.sin(strafeAngle) * this.entity.speed * 0.3;
        }
    }

    flee(dt, game) {
        if (!this.target) {
            this.setState(AIState.PATROL);
            return;
        }

        const dist = this.getDistanceToTarget();

        if (dist > 300) {
            this.setState(AIState.CHASE);
            return;
        }

        this.moveAway(this.target.x, this.target.y, this.entity.speed);
    }

    support(dt, game) {
        if (!this.target || !this.target.isAlive) {
            this.setState(AIState.PATROL);
            return;
        }

        const dist = this.getDistanceToTarget();

        // Stay near ally and use support abilities
        if (dist > 100) {
            this.moveToward(this.target.x, this.target.y, this.entity.speed * 0.6);
        } else {
            // Use shield on ally
            this.tryUseAbility('secondary', game);
        }

        // Also attack if monster is nearby
        const monster = game.getMonster();
        if (monster && Utils.distance(this.entity.x, this.entity.y, monster.x, monster.y) < 200) {
            this.entity.facingAngle = Utils.angle(this.entity.x, this.entity.y, monster.x, monster.y);
            this.tryUseAbility('primary', game);
        }
    }

    heal(dt, game) {
        if (!this.target || !this.target.isAlive || this.target.health >= this.target.maxHealth * 0.9) {
            this.setState(AIState.PATROL);
            return;
        }

        const dist = this.getDistanceToTarget();

        if (dist > 150) {
            this.moveToward(this.target.x, this.target.y, this.entity.speed);
        } else {
            this.stop();
            // Use healing abilities
            this.tryUseAbility('ability1', game); // Heal beam
            this.tryUseAbility('secondary', game); // Heal burst
        }
    }

    getOptimalRange() {
        switch (this.role) {
            case 'Damage Dealer':
                return 200;
            case 'Control Specialist':
                return 180;
            case 'Healer':
                return 220;
            case 'Buffer/Utility':
                return 150;
            default:
                return 180;
        }
    }

    tryUseAbility(abilityKey, game) {
        const ability = this.entity.abilities[abilityKey];
        if (ability && ability.canUse(this.entity)) {
            const target = this.target || { x: this.entity.x + Math.cos(this.entity.facingAngle) * 100, y: this.entity.y + Math.sin(this.entity.facingAngle) * 100 };
            ability.use(this.entity, target, game);
            return true;
        }
        return false;
    }
}

// Export
window.AIState = AIState;
window.AIController = AIController;
window.MonsterAI = MonsterAI;
window.HunterAI = HunterAI;
