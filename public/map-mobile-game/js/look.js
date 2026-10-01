/**
 * Primal Hunt - the art-direction layer.
 *
 * Small, phone-safe techniques that change how everything reads, applied on
 * top of the reused models rather than replacing them:
 *   - toon shading: three-band lighting plus a warm rim light, so the blocky
 *     models read as a deliberate style rather than placeholders;
 *   - outlines: an inverted shell behind each big part (one extra draw per
 *     part, only for parts large enough to matter);
 *   - wind: grass, flowers and bushes sway, and part around anything moving
 *     through them - including a monster you cannot otherwise see;
 *   - a colour grade: one full-screen pass that sets the mood per stage.
 */
window.PH = window.PH || {};

(() => {
  const Look = {};

  // Shared uniforms: one update per frame drives every material that uses them.
  Look.uniforms = {
    time: { value: 0 },
    push: { value: new THREE.Vector4(0, 0, 0, 0) },    // x, z, radius, strength - the player
    push2: { value: new THREE.Vector4(0, 0, 0, 0) },   // the monster or boss
    rimColor: { value: new THREE.Color(0xffe6c4) },
    rimStrength: { value: 0.38 },
  };

  let gradient = null;
  /** Three flat light bands. Nearest filtering is what makes the steps hard. */
  Look.gradientMap = () => {
    if (gradient) return gradient;
    gradient = new THREE.DataTexture(new Uint8Array([64, 135, 225]), 3, 1, THREE.LuminanceFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
    return gradient;
  };

  /** Add a rim light to a toon material: light the silhouette edges. */
  Look.addRim = (mat) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.rimColor = Look.uniforms.rimColor;
      sh.uniforms.rimStrength = Look.uniforms.rimStrength;
      sh.fragmentShader = 'uniform vec3 rimColor;\nuniform float rimStrength;\n' + sh.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        `float rimK = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
        outgoingLight += rimColor * rimStrength * pow( rimK, 2.6 );
        gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);
    };
    mat.customProgramCacheKey = () => 'ph-rim';
    return mat;
  };

  Look.toonMaterial = ({ flatShading, ...params }) => {
    // r128's toon material has no flatShading option, but honours the flag
    // when it is set afterwards (it only switches on a shader define).
    const m = new THREE.MeshToonMaterial({ gradientMap: Look.gradientMap(), ...params });
    if (flatShading) m.flatShading = true;
    return Look.addRim(m);
  };

  const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0b0c14, side: THREE.BackSide });
  const converted = new WeakMap();
  const convert = (m) => {
    if (!m || m.transparent || m.isShaderMaterial || m.isMeshToonMaterial || m === OUTLINE) return m;
    if (converted.has(m)) return converted.get(m);
    if (m.isMeshBasicMaterial) {
      // Unlit parts are eyes, visors and lamps: push them past white so they glow.
      const g = m.clone();
      g.toneMapped = false;
      g.color.multiplyScalar(2.4);
      converted.set(m, g);
      return g;
    }
    // The standard materials were partly metallic, which darkens their diffuse;
    // toon has no metalness, so carry that darkening over or everything washes out.
    const color = m.color.clone().multiplyScalar(1 - (m.metalness || 0) * 0.8);
    const t = Look.toonMaterial({
      color, emissive: m.emissive || new THREE.Color(0), emissiveIntensity: m.emissiveIntensity !== undefined ? m.emissiveIntensity : 1,
      vertexColors: m.vertexColors, flatShading: m.flatShading, map: m.map || null, side: m.side,
    });
    converted.set(m, t);
    return t;
  };

  Look.outlineMaterial = OUTLINE;
  /** Weak devices drop outlines first: hiding the shared material skips every shell. */
  Look.setOutlines = (on) => { OUTLINE.visible = on; };

  /**
   * Toon-shade a model and give its larger parts an outline shell. Materials
   * shared between models stay shared, and the model's own handles (the
   * monsters' glow materials) are pointed at the converted ones.
   */
  Look.stylize = (root, outline = 0.075, maxParts = 8) => {
    if (root.userData.styled) return root;
    root.userData.styled = true;
    const meshes = [];
    root.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const o of meshes) {
      o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
    }
    const ud = root.userData;
    for (const k of Object.keys(ud)) if (ud[k] && ud[k].isMaterial && converted.has(ud[k])) ud[k] = converted.get(ud[k]);
    // Shadows: everything solid receives them, but only the big parts cast -
    // each caster is another draw in the shadow pass.
    for (const o of meshes) { o.castShadow = false; o.receiveShadow = !!(o.material && !o.material.transparent && !o.material.isMeshBasicMaterial); }
    const casters = meshes.filter((o) => o.receiveShadow)
      .map((o) => { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); return o; })
      .sort((a, b) => b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius)
      .slice(0, maxParts);
    for (const o of casters) o.castShadow = true;
    if (outline > 0) {
      // Only the biggest parts get a shell: each one is a draw call, and the
      // silhouette is carried by the torso, head and limbs, not the trim.
      // (Skinned meshes get their own outline that bends with the skeleton.)
      const parts = meshes.filter((o) => !o.isSkinnedMesh && o.material && !o.material.transparent && !o.material.isMeshBasicMaterial)
        .map((o) => { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); return o; })
        .filter((o) => o.geometry.boundingSphere.radius >= 0.07)
        .sort((a, b) => b.geometry.boundingSphere.radius - a.geometry.boundingSphere.radius)
        .slice(0, maxParts);
      for (const o of parts) {
        const g = o.geometry;
        const r = g.boundingSphere.radius;
        // Scale about the part's own centre, so offset geometry stays in place.
        const s = 1 + Math.min(0.3, outline / r);
        const shell = new THREE.Mesh(g, OUTLINE);
        shell.scale.setScalar(s);
        shell.position.copy(g.boundingSphere.center).multiplyScalar(1 - s);
        shell.userData.outline = true;
        o.add(shell);
      }
    }
    return root;
  };

  /**
   * Wind for instanced foliage. Sways by height above the ground (local y),
   * and bends away from the player and the monster.
   */
  Look.windify = (mat, amp = 0.12) => {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      sh.uniforms.uTime = Look.uniforms.time;
      sh.uniforms.uPush = Look.uniforms.push;
      sh.uniforms.uPush2 = Look.uniforms.push2;
      sh.vertexShader = 'uniform float uTime;\nuniform vec4 uPush;\nuniform vec4 uPush2;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        vec4 wpos = modelMatrix * mvPosition;
        float hgt = max( 0.0, position.y );
        float sway = sin( uTime * 1.6 + wpos.x * 0.35 + wpos.z * 0.22 ) + 0.5 * sin( uTime * 2.7 + wpos.x * 0.9 - wpos.z * 0.4 );
        wpos.x += sway * ${amp.toFixed(3)} * hgt;
        wpos.z += sway * ${(amp * 0.6).toFixed(3)} * hgt;
        vec2 dp = wpos.xz - uPush.xy;
        float kp = max( 0.0, 1.0 - length( dp ) / max( uPush.z, 0.001 ) ) * uPush.w;
        wpos.xz += normalize( dp + vec2( 0.0001 ) ) * kp * hgt * 0.75;
        wpos.y -= kp * hgt * 0.3;
        vec2 dq = wpos.xz - uPush2.xy;
        float kq = max( 0.0, 1.0 - length( dq ) / max( uPush2.z, 0.001 ) ) * uPush2.w;
        wpos.xz += normalize( dq + vec2( 0.0001 ) ) * kq * hgt * 0.9;
        wpos.y -= kq * hgt * 0.35;
        mvPosition = viewMatrix * wpos;
        gl_Position = projectionMatrix * mvPosition;`);
    };
    mat.customProgramCacheKey = () => 'ph-wind-' + amp;
    return mat;
  };

  /* ── Colour grade ──────────────────────────────────────────── */

  // Per stage, in display (sRGB) space: shadow and highlight tints, saturation,
  // contrast, vignette. Day is warm and saturated; dusk turns violet in the
  // shadows; the final night is red and closed-in.
  Look.GRADES = [
    { shadow: [0.93, 0.99, 1.07], high: [1.06, 1.02, 0.92], sat: 1.2, contrast: 1.08, vignette: 0.26, bloom: 0.7 },
    { shadow: [0.96, 0.86, 1.14], high: [1.1, 0.97, 0.9], sat: 1.12, contrast: 1.1, vignette: 0.36, bloom: 0.9 },
    { shadow: [0.9, 0.76, 0.86], high: [1.14, 0.88, 0.8], sat: 1.02, contrast: 1.12, vignette: 0.5, bloom: 1.1 },
  ];

  /**
   * The grade and the glow. Where the GPU can render to half-float textures,
   * the scene renders in high dynamic range: ordinary surfaces are tone-mapped
   * to at most 1.0, while projectiles, lightning, gems and sparks are drawn
   * brighter than that - so the bloom picks out exactly those and nothing else.
   * Elsewhere it falls back to an 8-bit buffer and a brightness threshold.
   */
  Look.createGrade = (renderer) => {
    const gl2 = renderer.capabilities.isWebGL2;
    const hdr = gl2 && !!(renderer.extensions.get('EXT_color_buffer_float') || renderer.extensions.get('EXT_color_buffer_half_float'));
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const base = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType };
    const sceneOpts = { ...base, encoding: hdr ? THREE.LinearEncoding : THREE.sRGBEncoding };
    let rt;
    if (gl2 && THREE.WebGLMultisampleRenderTarget && renderer.getPixelRatio() < 2) {
      rt = new THREE.WebGLMultisampleRenderTarget(size.x, size.y, sceneOpts);
      rt.samples = 4;
    } else {
      rt = new THREE.WebGLRenderTarget(size.x, size.y, sceneOpts);
    }
    // Bloom at a quarter and an eighth of the screen: cheap, and wide.
    const small = { ...base, depthBuffer: false, stencilBuffer: false };
    const b1 = [new THREE.WebGLRenderTarget(1, 1, small), new THREE.WebGLRenderTarget(1, 1, small)];
    const b2 = [new THREE.WebGLRenderTarget(1, 1, small), new THREE.WebGLRenderTarget(1, 1, small)];

    const vert = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
    const pass = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader,
      depthTest: false, depthWrite: false, toneMapped: false, defines: hdr ? { HDR: 1 } : {} });
    const bright = pass(`
      uniform sampler2D tDiffuse; uniform float uThreshold;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D( tDiffuse, vUv ).rgb;
        #ifdef HDR
          vec3 b = max( c - uThreshold, 0.0 );          // only what is brighter than a lit surface can be
        #else
          float l = max( c.r, max( c.g, c.b ) );
          vec3 b = c * smoothstep( uThreshold, 1.0, l );
        #endif
        gl_FragColor = vec4( b, 1.0 );
      }`, { tDiffuse: { value: null }, uThreshold: { value: hdr ? 1.0 : 0.82 } });
    const blur = pass(`
      uniform sampler2D tDiffuse; uniform vec2 uDir;
      varying vec2 vUv;
      void main() {
        vec3 c = texture2D( tDiffuse, vUv ).rgb * 0.227027;
        c += ( texture2D( tDiffuse, vUv + uDir * 1.3846 ).rgb + texture2D( tDiffuse, vUv - uDir * 1.3846 ).rgb ) * 0.316216;
        c += ( texture2D( tDiffuse, vUv + uDir * 3.2308 ).rgb + texture2D( tDiffuse, vUv - uDir * 3.2308 ).rgb ) * 0.070270;
        gl_FragColor = vec4( c, 1.0 );
      }`, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
    const mat = pass(`
      uniform sampler2D tDiffuse, tBloom1, tBloom2;
      uniform vec3 uShadow, uHigh;
      uniform float uSat, uContrast, uVignette, uTime, uHurt, uBloom, uFlash;
      uniform vec4 uRipple[4];
      uniform vec2 uRes;
      varying vec2 vUv;
      vec3 toSRGB( vec3 c ) {
        return mix( c * 12.92, 1.055 * pow( c, vec3( 0.41666 ) ) - 0.055, step( 0.0031308, c ) );
      }
      void main() {
        // Heat shimmer: each ripple is a thin ring that bends the image outward.
        vec2 uv = vUv;
        float aspect = uRes.x / uRes.y;
        for ( int i = 0; i < 4; i++ ) {
          vec4 r = uRipple[ i ];
          if ( r.w <= 0.0 ) continue;
          vec2 d = uv - r.xy;
          d.x *= aspect;
          float dist = length( d );
          float k = smoothstep( 0.06, 0.0, abs( dist - r.z ) ) * r.w;
          vec2 dir = d / max( dist, 0.0001 );
          dir.x /= aspect;
          uv -= dir * k * 0.016;
        }
        vec3 c = texture2D( tDiffuse, uv ).rgb;
        vec3 glow = ( texture2D( tBloom1, vUv ).rgb * 0.8 + texture2D( tBloom2, vUv ).rgb * 1.2 ) * uBloom;
        #ifdef HDR
          // Over-bright cores roll off instead of clipping, then glow is added and it all goes to display space.
          c = c / ( 1.0 + max( c - 1.0, 0.0 ) * 0.5 );
          c = toSRGB( clamp( c + glow, 0.0, 1.0 ) );
        #else
          c = c + glow * ( 1.0 - c );                     // screen blend
        #endif
        float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
        c = mix( vec3( l ), c, uSat );
        c = ( c - 0.5 ) * uContrast + 0.5;
        c *= mix( uShadow, uHigh, smoothstep( 0.05, 0.85, l ) );
        vec2 d = vUv - 0.5;
        d.x *= uRes.x / uRes.y;
        float v = smoothstep( 0.95, 0.25, length( d ) );
        c *= mix( 1.0 - uVignette, 1.0, v );
        c = mix( c, c * vec3( 1.2, 0.55, 0.55 ), uHurt * ( 1.0 - v ) );
        c += vec3( 0.55, 0.65, 1.0 ) * uFlash * 0.38;      // the storm's lightning lights the whole sky
        float n = fract( sin( dot( gl_FragCoord.xy + uTime, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
        c += ( n - 0.5 ) / 255.0;
        gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
      }`, {
      tDiffuse: { value: rt.texture }, tBloom1: { value: b1[0].texture }, tBloom2: { value: b2[0].texture },
      uShadow: { value: new THREE.Vector3(1, 1, 1) }, uHigh: { value: new THREE.Vector3(1, 1, 1) },
      uSat: { value: 1 }, uContrast: { value: 1 }, uVignette: { value: 0.3 }, uBloom: { value: 0.8 },
      uRes: { value: new THREE.Vector2(size.x, size.y) }, uTime: { value: 0 }, uHurt: { value: 0 },
      uFlash: { value: 0 }, uRipple: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, 0)) },
    });

    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const draw = (material, target) => { quad.material = material; renderer.setRenderTarget(target); renderer.render(scene, camera); };
    const blurInto = (pair, w, h) => {
      blur.uniforms.tDiffuse.value = pair[0].texture; blur.uniforms.uDir.value.set(1 / w, 0); draw(blur, pair[1]);
      blur.uniforms.tDiffuse.value = pair[1].texture; blur.uniforms.uDir.value.set(0, 1 / h); draw(blur, pair[0]);
    };

    const grade = {
      rt, mat, scene, camera, hdr, bloomOn: true,
      setSize() {
        renderer.getDrawingBufferSize(size);
        rt.setSize(size.x, size.y);
        mat.uniforms.uRes.value.set(size.x, size.y);
        const w1 = Math.max(1, size.x >> 2), h1 = Math.max(1, size.y >> 2), w2 = Math.max(1, size.x >> 3), h2 = Math.max(1, size.y >> 3);
        b1.forEach((t) => t.setSize(w1, h1));
        b2.forEach((t) => t.setSize(w2, h2));
        this.w1 = w1; this.h1 = h1; this.w2 = w2; this.h2 = h2;
      },
      /** Blend the stage grades by a fractional stage, 0..2. */
      setStage(k) {
        const i = Math.min(1, Math.floor(k)), f = k - i, A = Look.GRADES[i], B = Look.GRADES[i + 1], u = mat.uniforms;
        const mix = (a, b) => a + (b - a) * f;
        u.uShadow.value.set(mix(A.shadow[0], B.shadow[0]), mix(A.shadow[1], B.shadow[1]), mix(A.shadow[2], B.shadow[2]));
        u.uHigh.value.set(mix(A.high[0], B.high[0]), mix(A.high[1], B.high[1]), mix(A.high[2], B.high[2]));
        u.uSat.value = mix(A.sat, B.sat);
        u.uContrast.value = mix(A.contrast, B.contrast);
        u.uVignette.value = mix(A.vignette, B.vignette);
        u.uBloom.value = this.bloomOn ? mix(A.bloom, B.bloom) : 0;
      },
      setRipples(list) {
        const r = mat.uniforms.uRipple.value;
        for (let i = 0; i < 4; i++) { const q = list[i]; if (q) r[i].set(q[0], q[1], q[2], q[3]); else r[i].w = 0; }
      },
      setFlash(f) { mat.uniforms.uFlash.value = f; },
      render(sceneIn, cameraIn, time) {
        mat.uniforms.uTime.value = (time * 60) % 1000;
        renderer.setRenderTarget(rt);
        renderer.render(sceneIn, cameraIn);
        if (this.bloomOn) {
          bright.uniforms.tDiffuse.value = rt.texture; draw(bright, b1[0]);
          blurInto(b1, this.w1, this.h1);
          blur.uniforms.tDiffuse.value = b1[0].texture; blur.uniforms.uDir.value.set(0, 0); draw(blur, b2[0]);   // downsample
          blurInto(b2, this.w2, this.h2);
        }
        quad.material = mat;
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      },
    };
    grade.setSize();
    return grade;
  };

  PH.Look = Look;
})();
