// Natural Language Prompt to LEGO Brick Model Procedural Generator
class BrickGenerator {
    constructor() {
        this.colorKeywords = {
            'red': 'RED', 'crimson': 'DARK_RED', 'ruby': 'DARK_RED',
            'blue': 'BLUE', 'azure': 'BLUE', 'navy': 'DARK_BLUE',
            'yellow': 'YELLOW', 'gold': 'GOLD', 'golden': 'GOLD',
            'green': 'GREEN', 'lime': 'LIME', 'emerald': 'GREEN',
            'orange': 'ORANGE', 'amber': 'ORANGE',
            'white': 'WHITE', 'snow': 'WHITE',
            'black': 'BLACK', 'shadow': 'BLACK', 'dark': 'DARK_GREY',
            'grey': 'LIGHT_GREY', 'gray': 'LIGHT_GREY', 'silver': 'LIGHT_GREY',
            'brown': 'BROWN', 'wood': 'BROWN', 'tan': 'TAN', 'sand': 'TAN',
            'purple': 'PURPLE', 'violet': 'PURPLE', 'pink': 'PINK'
        };
    }

    generateFromPrompt(promptText) {
        const text = (promptText || '').toLowerCase().trim();

        // 1. Direct match with inspiration library
        for (const preset of window.INSPIRATION_MODELS) {
            if (text.includes(preset.id) || text.includes(preset.name.toLowerCase())) {
                return JSON.parse(JSON.stringify(preset));
            }
        }

        // 2. Extract primary & secondary colors from prompt
        let primaryColor = 'RED';
        let secondaryColor = 'WHITE';
        let accentColor = 'YELLOW';

        const words = text.split(/\s+/);
        const detectedColors = [];
        for (const w of words) {
            if (this.colorKeywords[w] && !detectedColors.includes(this.colorKeywords[w])) {
                detectedColors.push(this.colorKeywords[w]);
            }
        }

        if (detectedColors.length > 0) primaryColor = detectedColors[0];
        if (detectedColors.length > 1) secondaryColor = detectedColors[1];
        if (detectedColors.length > 2) accentColor = detectedColors[2];

        // 3. Archetype classification
        if (text.includes('sub') || text.includes('submarine') || text.includes('underwater')) {
            return this.buildSubmarine(primaryColor === 'RED' ? 'YELLOW' : primaryColor);
        }
        if (text.includes('ship') || text.includes('boat') || text.includes('yacht') || text.includes('vessel')) {
            return this.buildBoat(primaryColor, secondaryColor);
        }
        if (text.includes('speeder') || text.includes('hover') || text.includes('future') || text.includes('cyber')) {
            return this.buildCyberSpeeder(primaryColor, secondaryColor);
        }
        if (text.includes('pyramid') || text.includes('monument') || text.includes('egypt')) {
            return this.buildPyramid(primaryColor === 'RED' ? 'TAN' : primaryColor);
        }
        if (text.includes('house') || text.includes('cabin') || text.includes('cottage') || text.includes('villa')) {
            return this.buildCozyCottage(primaryColor, secondaryColor);
        }
        if (text.includes('sword') || text.includes('blade') || text.includes('dagger')) {
            return this.buildPixelSword(primaryColor, secondaryColor);
        }
        if (text.includes('camera') || text.includes('vintage') || text.includes('lens')) {
            return this.buildVintageCamera();
        }
        if (text.includes('ufo') || text.includes('alien') || text.includes('saucer')) {
            return this.buildSaucer(primaryColor);
        }

        // 4. General Procedural Architectural Sculpture
        return this.buildProceduralCreation(promptText, primaryColor, secondaryColor, accentColor);
    }

    buildSubmarine(hullColor = 'YELLOW') {
        return {
            id: 'custom-submarine',
            name: `Micro ${window.LEGO_COLORS[hullColor].name} Submarine`,
            category: 'Vehicles',
            icon: '🌊',
            difficulty: 'Intermediate',
            estTime: '20 mins',
            description: 'Exploration submersible with rounded bow, viewing ports, conning tower, and twin observation periscopes.',
            bricks: [
                // Keel & Base
                { partId: '3020', color: 'DARK_GREY', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                // Lower Hull
                { partId: '3001', color: hullColor, x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
                { partId: '3003', color: hullColor, x: 0, y: 0.4, z: 2.5, rotY: 0, layer: 1 },
                // Bow & Stern Slopes
                { partId: '3039', color: hullColor, x: 0, y: 1.6, z: 2.5, rotY: Math.PI, layer: 2 },
                { partId: '3004', color: hullColor, x: 0, y: 1.6, z: 0.5, rotY: 0, layer: 2 },
                { partId: '3004', color: hullColor, x: 0, y: 1.6, z: -1.0, rotY: 0, layer: 2 },
                // Conning Tower
                { partId: '3003', color: hullColor, x: 0, y: 2.8, z: 0, rotY: 0, layer: 3 },
                // Periscope Mast
                { partId: '3062', color: 'LIGHT_GREY', x: 0, y: 4.0, z: 0, rotY: 0, layer: 4 },
                { partId: '3024', color: 'TRANS_BLUE', x: 0, y: 5.2, z: 0.4, rotY: 0, layer: 5 },
                // Propeller Stern Thruster
                { partId: '4589', color: 'BLACK', x: 0, y: 0.8, z: -2.2, rotY: -Math.PI / 2, layer: 1 }
            ]
        };
    }

    buildBoat(hullColor = 'WHITE', cabinColor = 'BLUE') {
        return {
            id: 'custom-boat',
            name: 'Coastal Patrol Cruiser',
            category: 'Vehicles',
            icon: '🛥️',
            difficulty: 'Intermediate',
            estTime: '20 mins',
            description: 'V-shaped planing hull cutter with enclosed wheelhouse, radar dome, and aft boarding deck.',
            bricks: [
                { partId: '3020', color: 'DARK_BLUE', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                { partId: '3001', color: hullColor, x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
                { partId: '3039', color: hullColor, x: 0, y: 1.6, z: 2.0, rotY: Math.PI, layer: 2 },
                { partId: '3004', color: cabinColor, x: 0, y: 1.6, z: 0, rotY: 0, layer: 2 },
                { partId: '3068', color: 'WHITE', x: 0, y: 2.8, z: 0, rotY: 0, layer: 3 },
                { partId: '98138', color: 'TRANS_ORANGE', x: 0, y: 3.2, z: 0, rotY: 0, layer: 4 }
            ]
        };
    }

    buildCyberSpeeder(primary = 'PURPLE', secondary = 'TRANS_BLUE') {
        return {
            id: 'custom-speeder',
            name: 'Cyberpunk Grav-Speeder',
            category: 'Space & Sci-Fi',
            icon: '⚡',
            difficulty: 'Intermediate',
            estTime: '20 mins',
            description: 'High-speed anti-gravity street skimmer featuring twin plasma repulsors and neon canopy.',
            bricks: [
                { partId: '3020', color: 'BLACK', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                // Repulsor pods
                { partId: '3023', color: secondary, x: -1.4, y: 0.4, z: 0, rotY: 0, layer: 1 },
                { partId: '3023', color: secondary, x: 1.4, y: 0.4, z: 0, rotY: 0, layer: 1 },
                // Cockpit Core
                { partId: '3003', color: primary, x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
                { partId: '3040', color: secondary, x: 0, y: 1.6, z: 0.6, rotY: 0, layer: 2 },
                { partId: '54200', color: primary, x: -1.0, y: 1.6, z: -1.0, rotY: 0, layer: 2 },
                { partId: '54200', color: primary, x: 1.0, y: 1.6, z: -1.0, rotY: 0, layer: 2 }
            ]
        };
    }

    buildPyramid(stoneColor = 'TAN') {
        return {
            id: 'custom-pyramid',
            name: 'Giza Sandstone Pyramid',
            category: 'Architecture',
            icon: '📐',
            difficulty: 'Beginner',
            estTime: '15 mins',
            description: 'Ancient stepped monument constructed from sun-bleached limestone with ceremonial capstone.',
            bricks: [
                // Base tier 1 (4x4)
                { partId: '3020', color: stoneColor, x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                { partId: '3020', color: stoneColor, x: 0, y: 0, z: 2.0, rotY: 0, layer: 0 },
                // Tier 2 (3x3)
                { partId: '3002', color: stoneColor, x: 0, y: 0.4, z: 0.5, rotY: 0, layer: 1 },
                // Tier 3 (2x2)
                { partId: '3003', color: stoneColor, x: 0, y: 1.6, z: 0.5, rotY: 0, layer: 2 },
                // Capstone (Gold)
                { partId: '54200', color: 'GOLD', x: 0, y: 2.8, z: 0.5, rotY: 0, layer: 3 }
            ]
        };
    }

    buildCozyCottage(wallColor = 'WHITE', roofColor = 'DARK_RED') {
        return {
            id: 'custom-cottage',
            name: 'Alpine Timber Cottage',
            category: 'Architecture',
            icon: '🏡',
            difficulty: 'Intermediate',
            estTime: '25 mins',
            description: 'Charming mountain dwelling with stone foundation, white timber walls, and pitched gabled roof.',
            bricks: [
                { partId: '3020', color: 'GREEN', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                // Walls
                { partId: '3001', color: wallColor, x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
                { partId: '3004', color: wallColor, x: -1.0, y: 1.6, z: 0, rotY: 0, layer: 2 },
                { partId: '3004', color: wallColor, x: 1.0, y: 1.6, z: 0, rotY: 0, layer: 2 },
                // Door & Window Plate
                { partId: '3024', color: 'BROWN', x: 0, y: 1.6, z: 1.0, rotY: 0, layer: 2 },
                // Gabled Roof
                { partId: '3039', color: roofColor, x: 0, y: 2.8, z: 0, rotY: 0, layer: 3 },
                // Chimney
                { partId: '3005', color: 'DARK_GREY', x: 1.0, y: 4.0, z: -0.5, rotY: 0, layer: 4 }
            ]
        };
    }

    buildPixelSword(bladeColor = 'LIGHT_GREY', hiltColor = 'GOLD') {
        return {
            id: 'custom-sword',
            name: 'Heroic Pixel Broadsword',
            category: 'Pop Culture & Tech',
            icon: '⚔️',
            difficulty: 'Beginner',
            estTime: '15 mins',
            description: 'Classic fantasy pixel blade featuring gleaming crossguard, gripped hilt, and steel fuller.',
            bricks: [
                // Pommel
                { partId: '98138', color: hiltColor, x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                // Grip
                { partId: '3005', color: 'BROWN', x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
                // Crossguard
                { partId: '3710', color: hiltColor, x: 0, y: 1.6, z: 0, rotY: 0, layer: 2 },
                // Blade Segments
                { partId: '3004', color: bladeColor, x: 0, y: 2.0, z: 0, rotY: Math.PI / 2, layer: 3 },
                { partId: '3004', color: bladeColor, x: 0, y: 3.2, z: 0, rotY: Math.PI / 2, layer: 4 },
                { partId: '3004', color: bladeColor, x: 0, y: 4.4, z: 0, rotY: Math.PI / 2, layer: 5 },
                // Pointed Tip
                { partId: '54200', color: bladeColor, x: 0, y: 5.6, z: 0, rotY: 0, layer: 6 }
            ]
        };
    }

    buildVintageCamera() {
        return {
            id: 'custom-camera',
            name: 'Classic Rangefinder Camera',
            category: 'Pop Culture & Tech',
            icon: '📷',
            difficulty: 'Intermediate',
            estTime: '20 mins',
            description: 'Retro 35mm rangefinder with textured leatherette body, chrome dials, and front lens element.',
            bricks: [
                { partId: '3020', color: 'BLACK', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                { partId: '3001', color: 'BLACK', x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
                { partId: '3001', color: 'LIGHT_GREY', x: 0, y: 1.6, z: 0, rotY: 0, layer: 2 },
                // Large Round Lens
                { partId: '3941', color: 'BLACK', x: 0, y: 0.8, z: 1.2, rotY: Math.PI / 2, layer: 2 },
                { partId: '98138', color: 'TRANS_BLUE', x: 0, y: 0.8, z: 1.8, rotY: Math.PI / 2, layer: 3 },
                // Shutter Button & Flash Cold Shoe
                { partId: '98138', color: 'RED', x: -1.2, y: 2.8, z: 0, rotY: 0, layer: 3 },
                { partId: '3024', color: 'LIGHT_GREY', x: 0.8, y: 2.8, z: 0, rotY: 0, layer: 3 }
            ]
        };
    }

    buildSaucer(hullColor = 'LIGHT_GREY') {
        return {
            id: 'custom-ufo',
            name: 'Classic Sci-Fi Flying Saucer',
            category: 'Space & Sci-Fi',
            icon: '🛸',
            difficulty: 'Beginner',
            estTime: '15 mins',
            description: 'Retro flying disc with equatorial thruster rim and central translucent dome cockpit.',
            bricks: [
                // Base
                { partId: '3022', color: 'DARK_GREY', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                // Saucer Disc Body (3x3 / 4x4)
                { partId: '3020', color: hullColor, x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
                { partId: '3020', color: hullColor, x: 0, y: 0.4, z: 0, rotY: Math.PI / 2, layer: 1 },
                // Edge Warning Beacons
                { partId: '98138', color: 'TRANS_ORANGE', x: -1.8, y: 0.8, z: 0, rotY: 0, layer: 2 },
                { partId: '98138', color: 'TRANS_ORANGE', x: 1.8, y: 0.8, z: 0, rotY: 0, layer: 2 },
                // Cockpit Dome
                { partId: '3062', color: 'TRANS_BLUE', x: 0, y: 0.8, z: 0, rotY: 0, layer: 2 },
                { partId: '4589', color: 'TRANS_BLUE', x: 0, y: 2.0, z: 0, rotY: 0, layer: 3 }
            ]
        };
    }

    buildProceduralCreation(prompt, primary, secondary, accent) {
        // Synthesizes a clean, structurally sound micro-scale artistic sculpture
        return {
            id: 'procedural-creation',
            name: `Micro ${prompt.charAt(0).toUpperCase() + prompt.slice(1)}`,
            category: 'Custom Creation',
            icon: '✨',
            difficulty: 'Intermediate',
            estTime: '20 mins',
            description: `A custom LEGO blueprint inspired by: "${prompt}". Designed with interlocking structural stability.`,
            bricks: [
                // Foundation Plinth
                { partId: '3020', color: 'DARK_GREY', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
                { partId: '3001', color: primary, x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
                { partId: '3003', color: secondary, x: -0.5, y: 1.6, z: 0, rotY: 0, layer: 2 },
                { partId: '3004', color: primary, x: 0.8, y: 1.6, z: 0, rotY: Math.PI / 2, layer: 2 },
                { partId: '3040', color: accent, x: -0.5, y: 2.8, z: 0.5, rotY: 0, layer: 3 },
                { partId: '3062', color: secondary, x: 0.8, y: 2.8, z: 0, rotY: 0, layer: 3 },
                { partId: '4589', color: accent, x: 0.8, y: 4.0, z: 0, rotY: 0, layer: 4 }
            ]
        };
    }
}

window.BrickGenerator = BrickGenerator;
