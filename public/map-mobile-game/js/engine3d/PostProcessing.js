/**
 * Post-Processing Effects for Primal Hunt
 * Enhanced with bloom, vignette, damage effects, and more
 */

class PostProcessing {
    constructor(renderer) {
        this.renderer3d = renderer;
        this.enabled = true;

        // Effect states
        this.damageFlash = 0; // 0-1 for damage vignette
        this.evolutionFlash = 0; // 0-1 for evolution screen flash
        this.evolutionColor = new THREE.Color(0xff6600);
        this.lowHealthPulse = false;
        this.currentPlayerHealth = 1.0; // 0-1

        // Check if we can use render targets
        this.supported = this.checkSupport();

        if (this.supported) {
            this.setup();
        }
    }

    checkSupport() {
        // Check for WebGL2 or required extensions
        const gl = this.renderer3d.renderer.getContext();
        return gl instanceof WebGL2RenderingContext ||
               (gl.getExtension('OES_texture_float') &&
                gl.getExtension('OES_texture_float_linear'));
    }

    setup() {
        const width = this.renderer3d.width;
        const height = this.renderer3d.height;

        // Create render targets
        this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });

        // Bloom render targets (half resolution for performance)
        this.bloomTarget1 = new THREE.WebGLRenderTarget(width / 2, height / 2, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });

        this.bloomTarget2 = new THREE.WebGLRenderTarget(width / 2, height / 2, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });

        // Create screen quad
        this.screenQuad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            null
        );
        this.screenScene = new THREE.Scene();
        this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.screenScene.add(this.screenQuad);

        // Create shaders
        this.createShaders();
    }

    createShaders() {
        // Brightness extraction shader (for bloom)
        this.brightPassMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                threshold: { value: 0.7 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform float threshold;
                varying vec2 vUv;

                void main() {
                    vec4 color = texture2D(tDiffuse, vUv);
                    float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
                    if (brightness > threshold) {
                        gl_FragColor = color;
                    } else {
                        gl_FragColor = vec4(0.0);
                    }
                }
            `
        });

        // Gaussian blur shader
        this.blurMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                resolution: { value: new THREE.Vector2() },
                direction: { value: new THREE.Vector2(1, 0) }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 resolution;
                uniform vec2 direction;
                varying vec2 vUv;

                void main() {
                    vec2 texelSize = 1.0 / resolution;
                    vec4 result = vec4(0.0);

                    // 9-tap Gaussian blur
                    float weights[5];
                    weights[0] = 0.227027;
                    weights[1] = 0.1945946;
                    weights[2] = 0.1216216;
                    weights[3] = 0.054054;
                    weights[4] = 0.016216;

                    result += texture2D(tDiffuse, vUv) * weights[0];

                    for (int i = 1; i < 5; i++) {
                        vec2 offset = direction * texelSize * float(i) * 2.0;
                        result += texture2D(tDiffuse, vUv + offset) * weights[i];
                        result += texture2D(tDiffuse, vUv - offset) * weights[i];
                    }

                    gl_FragColor = result;
                }
            `
        });

        // Final composite shader (bloom + vignette + color grading + damage/evolution effects)
        this.compositeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tBloom: { value: null },
                bloomStrength: { value: 0.5 },
                vignetteIntensity: { value: 0.3 },
                saturation: { value: 1.1 },
                contrast: { value: 1.1 },
                time: { value: 0 },
                // Damage effect uniforms
                damageFlash: { value: 0.0 },
                // Evolution effect uniforms
                evolutionFlash: { value: 0.0 },
                evolutionColor: { value: new THREE.Color(0xff6600) },
                // Low health effect uniforms
                lowHealthPulse: { value: 0.0 },
                playerHealth: { value: 1.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform sampler2D tBloom;
                uniform float bloomStrength;
                uniform float vignetteIntensity;
                uniform float saturation;
                uniform float contrast;
                uniform float time;
                uniform float damageFlash;
                uniform float evolutionFlash;
                uniform vec3 evolutionColor;
                uniform float lowHealthPulse;
                uniform float playerHealth;
                varying vec2 vUv;

                vec3 adjustSaturation(vec3 color, float sat) {
                    float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
                    return mix(vec3(grey), color, sat);
                }

                void main() {
                    vec4 base = texture2D(tDiffuse, vUv);
                    vec4 bloom = texture2D(tBloom, vUv);

                    // Add bloom
                    vec3 color = base.rgb + bloom.rgb * bloomStrength;

                    // Calculate distance from center for vignette effects
                    vec2 center = vUv - 0.5;
                    float dist = length(center);

                    // Base vignette
                    float vignette = 1.0 - dist * vignetteIntensity * 2.0;
                    vignette = clamp(vignette, 0.0, 1.0);
                    color *= vignette;

                    // ========== DAMAGE FLASH EFFECT ==========
                    if (damageFlash > 0.0) {
                        // Red vignette from edges
                        float damageVignette = smoothstep(0.3, 0.8, dist);
                        vec3 damageColor = vec3(0.8, 0.0, 0.0);

                        // Pulsing intensity
                        float pulse = 0.7 + 0.3 * sin(time * 20.0);
                        float damageIntensity = damageFlash * damageVignette * pulse;

                        // Add chromatic aberration at edges when damaged
                        vec2 aberrationOffset = center * 0.02 * damageFlash;
                        float rOffset = texture2D(tDiffuse, vUv + aberrationOffset).r;
                        float bOffset = texture2D(tDiffuse, vUv - aberrationOffset).b;
                        color.r = mix(color.r, rOffset, damageFlash * 0.5);
                        color.b = mix(color.b, bOffset, damageFlash * 0.5);

                        // Blend damage color
                        color = mix(color, damageColor, damageIntensity * 0.6);
                    }

                    // ========== LOW HEALTH PULSE ==========
                    if (playerHealth < 0.3) {
                        float healthFactor = 1.0 - (playerHealth / 0.3);
                        float lowHealthPulse = 0.5 + 0.5 * sin(time * 4.0);
                        float edgePulse = smoothstep(0.2, 0.7, dist) * lowHealthPulse * healthFactor;

                        // Desaturate slightly when low health
                        color = adjustSaturation(color, 1.0 - healthFactor * 0.4);

                        // Red pulsing edges
                        color = mix(color, vec3(0.5, 0.0, 0.0), edgePulse * 0.4);

                        // Subtle heartbeat darken
                        float heartbeat = pow(sin(time * 3.14159 * 1.5), 8.0);
                        color *= 1.0 - heartbeat * healthFactor * 0.2;
                    }

                    // ========== EVOLUTION FLASH EFFECT ==========
                    if (evolutionFlash > 0.0) {
                        // Screen flash with evolution color
                        float flashIntensity = evolutionFlash * evolutionFlash; // Ease out

                        // Radial burst pattern
                        float burstPattern = sin(dist * 30.0 - time * 10.0) * 0.5 + 0.5;
                        burstPattern *= 1.0 - smoothstep(0.0, 0.5, dist);

                        // Energy rings
                        float rings = sin((dist - time * 0.5) * 40.0) * 0.5 + 0.5;
                        rings *= evolutionFlash;

                        // Combine effects
                        vec3 evoGlow = evolutionColor * (flashIntensity + burstPattern * 0.3 + rings * 0.2);
                        color += evoGlow;

                        // Bloom boost during evolution
                        color += bloom.rgb * evolutionFlash * 2.0;

                        // White flash at peak
                        if (evolutionFlash > 0.8) {
                            float whitePeak = (evolutionFlash - 0.8) * 5.0;
                            color = mix(color, vec3(1.0), whitePeak * 0.5);
                        }
                    }

                    // Saturation adjustment
                    color = adjustSaturation(color, saturation);

                    // Contrast
                    color = (color - 0.5) * contrast + 0.5;

                    // Subtle color grading (warm highlights, cool shadows)
                    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
                    vec3 warm = vec3(1.05, 1.0, 0.95);
                    vec3 cool = vec3(0.95, 0.97, 1.05);
                    color *= mix(cool, warm, luminance);

                    gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
                }
            `
        });
    }

    resize(width, height) {
        if (!this.supported) return;

        this.renderTarget.setSize(width, height);
        this.bloomTarget1.setSize(width / 2, height / 2);
        this.bloomTarget2.setSize(width / 2, height / 2);
    }

    render(scene, camera, time) {
        if (!this.supported || !this.enabled) {
            // Fallback to direct rendering
            this.renderer3d.renderer.render(scene, camera);
            return;
        }

        const renderer = this.renderer3d.renderer;

        // Step 1: Render scene to render target
        renderer.setRenderTarget(this.renderTarget);
        renderer.render(scene, camera);

        // Step 2: Extract bright areas for bloom
        this.screenQuad.material = this.brightPassMaterial;
        this.brightPassMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
        renderer.setRenderTarget(this.bloomTarget1);
        renderer.render(this.screenScene, this.screenCamera);

        // Step 3: Blur horizontally
        this.screenQuad.material = this.blurMaterial;
        this.blurMaterial.uniforms.tDiffuse.value = this.bloomTarget1.texture;
        this.blurMaterial.uniforms.resolution.value.set(
            this.bloomTarget1.width,
            this.bloomTarget1.height
        );
        this.blurMaterial.uniforms.direction.value.set(1, 0);
        renderer.setRenderTarget(this.bloomTarget2);
        renderer.render(this.screenScene, this.screenCamera);

        // Step 4: Blur vertically
        this.blurMaterial.uniforms.tDiffuse.value = this.bloomTarget2.texture;
        this.blurMaterial.uniforms.direction.value.set(0, 1);
        renderer.setRenderTarget(this.bloomTarget1);
        renderer.render(this.screenScene, this.screenCamera);

        // Additional blur pass for smoother bloom
        this.blurMaterial.uniforms.tDiffuse.value = this.bloomTarget1.texture;
        this.blurMaterial.uniforms.direction.value.set(1, 0);
        renderer.setRenderTarget(this.bloomTarget2);
        renderer.render(this.screenScene, this.screenCamera);

        this.blurMaterial.uniforms.tDiffuse.value = this.bloomTarget2.texture;
        this.blurMaterial.uniforms.direction.value.set(0, 1);
        renderer.setRenderTarget(this.bloomTarget1);
        renderer.render(this.screenScene, this.screenCamera);

        // Step 5: Composite final image
        this.screenQuad.material = this.compositeMaterial;
        this.compositeMaterial.uniforms.tDiffuse.value = this.renderTarget.texture;
        this.compositeMaterial.uniforms.tBloom.value = this.bloomTarget1.texture;
        this.compositeMaterial.uniforms.time.value = time;

        renderer.setRenderTarget(null);
        renderer.render(this.screenScene, this.screenCamera);
    }

    setBloomStrength(strength) {
        if (this.compositeMaterial) {
            this.compositeMaterial.uniforms.bloomStrength.value = strength;
        }
    }

    setVignetteIntensity(intensity) {
        if (this.compositeMaterial) {
            this.compositeMaterial.uniforms.vignetteIntensity.value = intensity;
        }
    }

    // ========== DAMAGE EFFECT METHODS ==========

    /**
     * Trigger damage flash effect
     * @param {number} intensity - 0 to 1, how intense the damage was
     */
    triggerDamageFlash(intensity = 1.0) {
        this.damageFlash = Math.min(1.0, intensity);
        if (this.compositeMaterial) {
            this.compositeMaterial.uniforms.damageFlash.value = this.damageFlash;
        }
    }

    // ========== EVOLUTION EFFECT METHODS ==========

    /**
     * Trigger evolution flash effect
     * @param {string} monsterType - goliath, kraken, wraith, behemoth
     * @param {number} stage - evolution stage (1, 2, or 3)
     */
    triggerEvolutionFlash(monsterType = 'goliath', stage = 2) {
        this.evolutionFlash = 1.0;

        // Set color based on monster type
        const colors = {
            goliath: 0xff4400,
            kraken: 0x9966ff,
            wraith: 0xcc66ff,
            behemoth: 0xff8800
        };

        this.evolutionColor.setHex(colors[monsterType] || colors.goliath);

        if (this.compositeMaterial) {
            this.compositeMaterial.uniforms.evolutionFlash.value = this.evolutionFlash;
            this.compositeMaterial.uniforms.evolutionColor.value = this.evolutionColor;
        }
    }

    // ========== HEALTH EFFECT METHODS ==========

    /**
     * Update player health for low health effects
     * @param {number} healthPercent - 0 to 1
     */
    setPlayerHealth(healthPercent) {
        this.currentPlayerHealth = Math.max(0, Math.min(1, healthPercent));
        if (this.compositeMaterial) {
            this.compositeMaterial.uniforms.playerHealth.value = this.currentPlayerHealth;
        }
    }

    // ========== UPDATE METHOD ==========

    /**
     * Update effect animations (call each frame)
     * @param {number} deltaTime - time since last frame in seconds
     */
    update(deltaTime) {
        // Decay damage flash
        if (this.damageFlash > 0) {
            this.damageFlash = Math.max(0, this.damageFlash - deltaTime * 3.0);
            if (this.compositeMaterial) {
                this.compositeMaterial.uniforms.damageFlash.value = this.damageFlash;
            }
        }

        // Decay evolution flash (slower decay for dramatic effect)
        if (this.evolutionFlash > 0) {
            this.evolutionFlash = Math.max(0, this.evolutionFlash - deltaTime * 0.5);
            if (this.compositeMaterial) {
                this.compositeMaterial.uniforms.evolutionFlash.value = this.evolutionFlash;
            }
        }
    }

    // ========== QUALITY SETTINGS ==========

    /**
     * Set quality level for performance optimization
     * @param {string} quality - 'low', 'medium', 'high'
     */
    setQuality(quality) {
        if (!this.supported) return;

        const width = this.renderer3d.width;
        const height = this.renderer3d.height;

        switch (quality) {
            case 'low':
                // Disable bloom for low-end devices
                this.bloomEnabled = false;
                this.setBloomStrength(0);
                break;

            case 'medium':
                // Quarter resolution bloom
                this.bloomEnabled = true;
                this.bloomTarget1.setSize(width / 4, height / 4);
                this.bloomTarget2.setSize(width / 4, height / 4);
                this.setBloomStrength(0.3);
                break;

            case 'high':
            default:
                // Half resolution bloom (default)
                this.bloomEnabled = true;
                this.bloomTarget1.setSize(width / 2, height / 2);
                this.bloomTarget2.setSize(width / 2, height / 2);
                this.setBloomStrength(0.5);
                break;
        }
    }

    /**
     * Check if device is mobile for auto quality settings
     */
    autoDetectQuality() {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isLowEnd = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;

        if (isMobile && isLowEnd) {
            this.setQuality('low');
        } else if (isMobile) {
            this.setQuality('medium');
        } else {
            this.setQuality('high');
        }
    }

    dispose() {
        if (!this.supported) return;

        this.renderTarget.dispose();
        this.bloomTarget1.dispose();
        this.bloomTarget2.dispose();
        this.brightPassMaterial.dispose();
        this.blurMaterial.dispose();
        this.compositeMaterial.dispose();
        this.screenQuad.geometry.dispose();
    }
}

// Export
window.PostProcessing = PostProcessing;
