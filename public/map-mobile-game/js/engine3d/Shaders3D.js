/**
 * Custom Shaders for Primal Hunt
 * Provides stylized visual effects including toon shading,
 * evolution glow, damage effects, and more
 */

class Shaders3D {
    constructor(renderer) {
        this.renderer = renderer;
        this.shaderMaterials = new Map();
        this.createShaders();
    }

    createShaders() {
        // Create shader definitions
        this.shaderDefs = {
            toon: this.createToonShader(),
            evolutionGlow: this.createEvolutionGlowShader(),
            damage: this.createDamageShader(),
            energy: this.createEnergyShader(),
            water: this.createWaterShader(),
            forcefield: this.createForcefieldShader()
        };
    }

    /**
     * Toon/Cel Shader for stylized cartoon look
     */
    createToonShader() {
        return {
            uniforms: {
                color: { value: new THREE.Color(0xffffff) },
                lightPosition: { value: new THREE.Vector3(5, 10, 5) },
                steps: { value: 4.0 },
                rimPower: { value: 2.0 },
                rimColor: { value: new THREE.Color(0x333333) }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mvPosition.xyz;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform vec3 lightPosition;
                uniform float steps;
                uniform float rimPower;
                uniform vec3 rimColor;

                varying vec3 vNormal;
                varying vec3 vViewPosition;
                varying vec2 vUv;

                void main() {
                    // Calculate light direction
                    vec3 lightDir = normalize(lightPosition);

                    // Diffuse lighting with steps (cel-shading)
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    diff = floor(diff * steps) / steps;

                    // Rim lighting
                    vec3 viewDir = normalize(vViewPosition);
                    float rim = 1.0 - max(dot(vNormal, viewDir), 0.0);
                    rim = pow(rim, rimPower);

                    // Combine
                    vec3 finalColor = color * (0.3 + diff * 0.7);
                    finalColor += rimColor * rim * 0.3;

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `
        };
    }

    /**
     * Evolution Glow Shader for monster evolution stages
     */
    createEvolutionGlowShader() {
        return {
            uniforms: {
                time: { value: 0.0 },
                baseColor: { value: new THREE.Color(0xff4400) },
                glowColor: { value: new THREE.Color(0xffaa00) },
                evolutionStage: { value: 1.0 },
                glowIntensity: { value: 0.5 },
                pulseSpeed: { value: 2.0 }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 baseColor;
                uniform vec3 glowColor;
                uniform float evolutionStage;
                uniform float glowIntensity;
                uniform float pulseSpeed;

                varying vec3 vNormal;
                varying vec3 vPosition;
                varying vec2 vUv;

                void main() {
                    // Pulsing glow based on evolution stage
                    float pulse = sin(time * pulseSpeed) * 0.5 + 0.5;
                    float glow = glowIntensity * evolutionStage * (0.5 + pulse * 0.5);

                    // Edge glow (fresnel-like effect)
                    vec3 viewDir = normalize(cameraPosition - vPosition);
                    float edge = 1.0 - max(dot(vNormal, viewDir), 0.0);
                    edge = pow(edge, 2.0);

                    // Pattern based on UV and position
                    float pattern = sin(vUv.x * 10.0 + time) * sin(vUv.y * 10.0 + time * 0.7);
                    pattern = pattern * 0.5 + 0.5;

                    // Combine colors
                    vec3 finalColor = mix(baseColor, glowColor, edge * glow);
                    finalColor += glowColor * pattern * glow * 0.3;
                    finalColor += glowColor * edge * evolutionStage * 0.2;

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `
        };
    }

    /**
     * Damage Flash Shader - red flash when taking damage
     */
    createDamageShader() {
        return {
            uniforms: {
                baseColor: { value: new THREE.Color(0xffffff) },
                damageColor: { value: new THREE.Color(0xff0000) },
                damageAmount: { value: 0.0 },
                time: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;

                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 baseColor;
                uniform vec3 damageColor;
                uniform float damageAmount;
                uniform float time;

                varying vec2 vUv;
                varying vec3 vNormal;

                void main() {
                    // Flash effect that fades
                    float flash = damageAmount * (0.5 + sin(time * 20.0) * 0.5);

                    vec3 finalColor = mix(baseColor, damageColor, flash);

                    // Add white flash at peak damage
                    if (damageAmount > 0.8) {
                        finalColor = mix(finalColor, vec3(1.0), (damageAmount - 0.8) * 5.0);
                    }

                    gl_FragColor = vec4(finalColor, 1.0);
                }
            `
        };
    }

    /**
     * Energy Shader for abilities and power effects
     */
    createEnergyShader() {
        return {
            uniforms: {
                time: { value: 0.0 },
                color1: { value: new THREE.Color(0x00ffff) },
                color2: { value: new THREE.Color(0x0066ff) },
                speed: { value: 1.0 },
                intensity: { value: 1.0 },
                noiseScale: { value: 3.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;

                void main() {
                    vUv = uv;
                    vPosition = position;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float speed;
                uniform float intensity;
                uniform float noiseScale;

                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;

                // Simple noise function
                float noise(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }

                void main() {
                    // Flowing energy pattern
                    float flow = sin(vUv.y * noiseScale + time * speed) * 0.5 + 0.5;
                    float flow2 = sin(vUv.x * noiseScale * 0.7 + time * speed * 1.3) * 0.5 + 0.5;

                    // Add some noise
                    float n = noise(vUv * 10.0 + time);

                    // Edge glow
                    vec3 viewDir = normalize(cameraPosition - vPosition);
                    float edge = 1.0 - max(dot(vNormal, viewDir), 0.0);
                    edge = pow(edge, 1.5);

                    // Mix colors based on flow
                    float mixFactor = (flow + flow2) * 0.5 + n * 0.2;
                    vec3 finalColor = mix(color1, color2, mixFactor);

                    // Apply intensity and edge
                    float alpha = (0.5 + edge * 0.5) * intensity;
                    finalColor *= intensity;
                    finalColor += vec3(1.0) * edge * 0.3;

                    gl_FragColor = vec4(finalColor, alpha);
                }
            `
        };
    }

    /**
     * Water Shader with animation
     */
    createWaterShader() {
        return {
            uniforms: {
                time: { value: 0.0 },
                waterColor: { value: new THREE.Color(0x0066aa) },
                foamColor: { value: new THREE.Color(0xaaddff) },
                waveSpeed: { value: 1.0 },
                waveScale: { value: 10.0 },
                transparency: { value: 0.7 }
            },
            vertexShader: `
                uniform float time;
                uniform float waveSpeed;
                uniform float waveScale;

                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vWave;

                void main() {
                    vUv = uv;
                    vPosition = position;

                    // Wave displacement
                    float wave = sin(position.x * waveScale + time * waveSpeed) * 0.05;
                    wave += sin(position.z * waveScale * 0.7 + time * waveSpeed * 1.3) * 0.03;
                    vWave = wave;

                    vec3 newPosition = position;
                    newPosition.y += wave;

                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 waterColor;
                uniform vec3 foamColor;
                uniform float transparency;

                varying vec2 vUv;
                varying vec3 vPosition;
                varying float vWave;

                void main() {
                    // Caustics-like pattern
                    float caustic = sin(vUv.x * 20.0 + time * 2.0) * sin(vUv.y * 20.0 + time * 1.5);
                    caustic = caustic * 0.5 + 0.5;
                    caustic = pow(caustic, 3.0) * 0.3;

                    // Foam at wave peaks
                    float foam = smoothstep(0.03, 0.05, vWave);

                    // Mix colors
                    vec3 finalColor = waterColor;
                    finalColor += vec3(caustic * 0.5);
                    finalColor = mix(finalColor, foamColor, foam * 0.5);

                    // Fresnel effect for edge
                    float alpha = transparency + (1.0 - transparency) * foam;

                    gl_FragColor = vec4(finalColor, alpha);
                }
            `
        };
    }

    /**
     * Forcefield/Shield Shader
     */
    createForcefieldShader() {
        return {
            uniforms: {
                time: { value: 0.0 },
                color: { value: new THREE.Color(0x00aaff) },
                hitPoint: { value: new THREE.Vector3(0, 0, 0) },
                hitTime: { value: -10.0 },
                gridScale: { value: 20.0 }
            },
            vertexShader: `
                varying vec3 vPosition;
                varying vec3 vNormal;
                varying vec2 vUv;

                void main() {
                    vUv = uv;
                    vPosition = position;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                uniform vec3 hitPoint;
                uniform float hitTime;
                uniform float gridScale;

                varying vec3 vPosition;
                varying vec3 vNormal;
                varying vec2 vUv;

                void main() {
                    // Hex grid pattern
                    vec2 uv = vUv * gridScale;
                    float hex = abs(fract(uv.x) - 0.5) + abs(fract(uv.y) - 0.5);
                    hex = smoothstep(0.4, 0.5, hex);

                    // Edge glow (fresnel)
                    vec3 viewDir = normalize(cameraPosition - vPosition);
                    float edge = 1.0 - max(dot(vNormal, viewDir), 0.0);
                    edge = pow(edge, 2.0);

                    // Hit ripple effect
                    float hitDist = distance(vPosition, hitPoint);
                    float timeSinceHit = time - hitTime;
                    float ripple = 0.0;
                    if (timeSinceHit > 0.0 && timeSinceHit < 1.0) {
                        float rippleRadius = timeSinceHit * 2.0;
                        ripple = 1.0 - smoothstep(rippleRadius - 0.1, rippleRadius + 0.1, hitDist);
                        ripple *= 1.0 - timeSinceHit;
                    }

                    // Combine
                    float alpha = 0.1 + edge * 0.4 + hex * 0.2 + ripple * 0.5;
                    vec3 finalColor = color;
                    finalColor += vec3(1.0) * ripple * 0.5;
                    finalColor += vec3(1.0) * hex * 0.1;

                    gl_FragColor = vec4(finalColor, alpha);
                }
            `
        };
    }

    /**
     * Create a shader material from a shader definition
     */
    createMaterial(shaderName, customUniforms = {}) {
        const shaderDef = this.shaderDefs[shaderName];
        if (!shaderDef) {
            console.warn(`Shader ${shaderName} not found`);
            return null;
        }

        // Clone uniforms and merge with custom ones
        const uniforms = {};
        for (const key in shaderDef.uniforms) {
            uniforms[key] = { value: shaderDef.uniforms[key].value.clone ?
                shaderDef.uniforms[key].value.clone() :
                shaderDef.uniforms[key].value };
        }

        // Apply custom uniforms
        for (const key in customUniforms) {
            if (uniforms[key]) {
                uniforms[key].value = customUniforms[key];
            }
        }

        const material = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shaderDef.vertexShader,
            fragmentShader: shaderDef.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide
        });

        return material;
    }

    /**
     * Get a cached or new toon material
     */
    getToonMaterial(color) {
        const key = `toon_${color.toString(16)}`;
        if (this.shaderMaterials.has(key)) {
            return this.shaderMaterials.get(key);
        }

        const material = this.createMaterial('toon', {
            color: new THREE.Color(color)
        });
        this.shaderMaterials.set(key, material);
        return material;
    }

    /**
     * Get evolution glow material for a monster
     */
    getEvolutionMaterial(baseColor, evolutionStage) {
        const material = this.createMaterial('evolutionGlow', {
            baseColor: new THREE.Color(baseColor),
            evolutionStage: evolutionStage
        });
        return material;
    }

    /**
     * Get energy material for ability effects
     */
    getEnergyMaterial(color1, color2, intensity = 1.0) {
        const material = this.createMaterial('energy', {
            color1: new THREE.Color(color1),
            color2: new THREE.Color(color2),
            intensity: intensity
        });
        return material;
    }

    /**
     * Get water material
     */
    getWaterMaterial() {
        if (this.shaderMaterials.has('water')) {
            return this.shaderMaterials.get('water');
        }

        const material = this.createMaterial('water');
        this.shaderMaterials.set('water', material);
        return material;
    }

    /**
     * Get forcefield material
     */
    getForcefieldMaterial(color) {
        const material = this.createMaterial('forcefield', {
            color: new THREE.Color(color)
        });
        return material;
    }

    /**
     * Update time-based uniforms for all shader materials
     */
    update(time) {
        this.shaderMaterials.forEach(material => {
            if (material.uniforms && material.uniforms.time) {
                material.uniforms.time.value = time;
            }
        });
    }

    /**
     * Trigger damage flash on a material
     */
    triggerDamageFlash(material, duration = 0.3) {
        if (!material.uniforms || !material.uniforms.damageAmount) return;

        material.uniforms.damageAmount.value = 1.0;

        // Animate fade out
        const startTime = performance.now();
        const animate = () => {
            const elapsed = (performance.now() - startTime) / 1000;
            if (elapsed < duration) {
                material.uniforms.damageAmount.value = 1.0 - (elapsed / duration);
                requestAnimationFrame(animate);
            } else {
                material.uniforms.damageAmount.value = 0.0;
            }
        };
        animate();
    }

    /**
     * Trigger hit effect on forcefield
     */
    triggerForcefieldHit(material, hitPoint, time) {
        if (!material.uniforms) return;

        material.uniforms.hitPoint.value.copy(hitPoint);
        material.uniforms.hitTime.value = time;
    }
}

// Export
window.Shaders3D = Shaders3D;
