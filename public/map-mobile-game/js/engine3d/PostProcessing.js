/**
 * Post-Processing Effects for Primal Hunt
 * Implements bloom, vignette, and color grading
 */

class PostProcessing {
    constructor(renderer) {
        this.renderer3d = renderer;
        this.enabled = true;

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

        // Final composite shader (bloom + vignette + color grading)
        this.compositeMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tBloom: { value: null },
                bloomStrength: { value: 0.5 },
                vignetteIntensity: { value: 0.3 },
                saturation: { value: 1.1 },
                contrast: { value: 1.1 },
                time: { value: 0 }
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

                    // Vignette
                    vec2 center = vUv - 0.5;
                    float dist = length(center);
                    float vignette = 1.0 - dist * vignetteIntensity * 2.0;
                    vignette = clamp(vignette, 0.0, 1.0);
                    color *= vignette;

                    // Saturation
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
