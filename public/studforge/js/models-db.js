// Curated LEGO Inspiration Models Database
// Coordinates:
// x: Left/Right in studs (1 stud = 1.0 unit)
// y: Vertical elevation in studs/plates (plate = 0.4 units, brick = 1.2 units)
// z: Forward/Backward in studs
// rotY: 0, Math.PI/2, Math.PI, etc.
// layer: vertical assembly step index (for exploded view and step-by-step building)

const INSPIRATION_MODELS = [
    {
        id: 'rocket',
        name: 'Apollo Micro Rocket & Gantry',
        category: 'Space & Sci-Fi',
        icon: '🚀',
        difficulty: 'Intermediate',
        estTime: '20 mins',
        description: 'Multi-stage Saturn V exploration rocket with umbilical gantry tower, flame trench, and lunar command module.',
        bricks: [
            // Layer 0: Launch Pad Base (Grey & Red)
            { partId: '3020', color: 'DARK_GREY', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3020', color: 'DARK_GREY', x: 0, y: 0, z: 4, rotY: 0, layer: 0 },
            { partId: '3020', color: 'DARK_GREY', x: 0, y: 0, z: -4, rotY: 0, layer: 0 },
            // Layer 1: Flame deflectors & gantry post
            { partId: '3004', color: 'RED', x: -1.5, y: 0.4, z: 0, rotY: Math.PI / 2, layer: 1 },
            { partId: '3004', color: 'RED', x: -1.5, y: 1.6, z: 0, rotY: Math.PI / 2, layer: 2 },
            { partId: '3004', color: 'RED', x: -1.5, y: 2.8, z: 0, rotY: Math.PI / 2, layer: 3 },
            { partId: '3023', color: 'RED', x: -0.5, y: 3.2, z: 0, rotY: 0, layer: 4 }, // gantry arm
            // Rocket Stage 1 (Thrusters & Core)
            { partId: '3062', color: 'DARK_GREY', x: 0.5, y: 0.4, z: 0, rotY: 0, layer: 1 },
            { partId: '3941', color: 'WHITE', x: 0.5, y: 1.6, z: 0, rotY: 0, layer: 2 },
            { partId: '3022', color: 'BLACK', x: 0.5, y: 2.8, z: 0, rotY: 0, layer: 3 },
            // Rocket Stage 2 & 3
            { partId: '3941', color: 'WHITE', x: 0.5, y: 3.2, z: 0, rotY: 0, layer: 4 },
            { partId: '3062', color: 'WHITE', x: 0.5, y: 4.4, z: 0, rotY: 0, layer: 5 },
            // Command Module & Escape Tower
            { partId: '4589', color: 'WHITE', x: 0.5, y: 5.6, z: 0, rotY: 0, layer: 6 },
            { partId: '3024', color: 'TRANS_ORANGE', x: 0.5, y: 6.8, z: 0, rotY: 0, layer: 7 }
        ]
    },
    {
        id: 'castle',
        name: 'Medieval Keep & Gatehouse',
        category: 'Castle & Fantasy',
        icon: '🏰',
        difficulty: 'Intermediate',
        estTime: '25 mins',
        description: 'Sturdy fortress bastion featuring crenelated parapets, portcullis archway, and royal crimson standards.',
        bricks: [
            // Foundation
            { partId: '3020', color: 'GREEN', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3020', color: 'GREEN', x: 0, y: 0, z: 3, rotY: 0, layer: 0 },
            // Towers (Left & Right)
            { partId: '3003', color: 'LIGHT_GREY', x: -1.5, y: 0.4, z: 1.5, rotY: 0, layer: 1 },
            { partId: '3003', color: 'LIGHT_GREY', x: 1.5, y: 0.4, z: 1.5, rotY: 0, layer: 1 },
            { partId: '3003', color: 'DARK_GREY', x: -1.5, y: 1.6, z: 1.5, rotY: 0, layer: 2 },
            { partId: '3003', color: 'DARK_GREY', x: 1.5, y: 1.6, z: 1.5, rotY: 0, layer: 2 },
            // Gate Arch / Spanner
            { partId: '3010', color: 'LIGHT_GREY', x: 0, y: 2.0, z: 1.5, rotY: 0, layer: 2 },
            // Portcullis Grill
            { partId: '3023', color: 'BROWN', x: 0, y: 0.4, z: 1.5, rotY: 0, layer: 1 },
            // Upper Battlements & Parapets
            { partId: '3004', color: 'LIGHT_GREY', x: -1.5, y: 2.8, z: 1.5, rotY: 0, layer: 3 },
            { partId: '3004', color: 'LIGHT_GREY', x: 1.5, y: 2.8, z: 1.5, rotY: 0, layer: 3 },
            { partId: '3024', color: 'LIGHT_GREY', x: -2.0, y: 4.0, z: 1.5, rotY: 0, layer: 4 },
            { partId: '3024', color: 'LIGHT_GREY', x: -1.0, y: 4.0, z: 1.5, rotY: 0, layer: 4 },
            { partId: '3024', color: 'LIGHT_GREY', x: 1.0, y: 4.0, z: 1.5, rotY: 0, layer: 4 },
            { partId: '3024', color: 'LIGHT_GREY', x: 2.0, y: 4.0, z: 1.5, rotY: 0, layer: 4 },
            // Royal Pennant Flags
            { partId: '54200', color: 'DARK_RED', x: -1.5, y: 4.4, z: 1.5, rotY: 0, layer: 5 },
            { partId: '54200', color: 'DARK_RED', x: 1.5, y: 4.4, z: 1.5, rotY: 0, layer: 5 }
        ]
    },
    {
        id: 'sportscar',
        name: 'Classic Turbo Coupe',
        category: 'Vehicles',
        icon: '🏎️',
        difficulty: 'Beginner',
        estTime: '15 mins',
        description: 'Vibrant yellow 80s supercar with low-slung chassis, trans-black windscreen, and aero rear spoiler.',
        bricks: [
            // Chassis Base Plate
            { partId: '3020', color: 'BLACK', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3023', color: 'BLACK', x: 0, y: 0, z: 2.5, rotY: 0, layer: 0 },
            // Wheels (Rubber Round Bricks)
            { partId: '3062', color: 'BLACK', x: -1.2, y: 0.2, z: -1.2, rotY: Math.PI / 2, layer: 0 },
            { partId: '3062', color: 'BLACK', x: 1.2, y: 0.2, z: -1.2, rotY: Math.PI / 2, layer: 0 },
            { partId: '3062', color: 'BLACK', x: -1.2, y: 0.2, z: 1.8, rotY: Math.PI / 2, layer: 0 },
            { partId: '3062', color: 'BLACK', x: 1.2, y: 0.2, z: 1.8, rotY: Math.PI / 2, layer: 0 },
            // Bodywork (Bright Yellow)
            { partId: '3003', color: 'YELLOW', x: 0, y: 0.4, z: -0.5, rotY: 0, layer: 1 },
            { partId: '3004', color: 'YELLOW', x: 0, y: 0.4, z: 1.5, rotY: 0, layer: 1 },
            // Hood Slope
            { partId: '3039', color: 'YELLOW', x: 0, y: 1.6, z: 1.5, rotY: Math.PI, layer: 2 },
            // Windscreen (Trans-Black / Trans-Blue)
            { partId: '3039', color: 'TRANS_BLUE', x: 0, y: 1.6, z: 0, rotY: 0, layer: 2 },
            // Roof & Rear Spoiler
            { partId: '3068', color: 'YELLOW', x: 0, y: 2.8, z: -0.5, rotY: 0, layer: 3 },
            { partId: '3023', color: 'BLACK', x: 0, y: 2.4, z: -1.8, rotY: 0, layer: 3 },
            { partId: '54200', color: 'TRANS_RED', x: -0.7, y: 1.6, z: -1.8, rotY: 0, layer: 2 },
            { partId: '54200', color: 'TRANS_RED', x: 0.7, y: 1.6, z: -1.8, rotY: 0, layer: 2 }
        ]
    },
    {
        id: 'bonsai',
        name: 'Zen Bonsai in Ceramic Dish',
        category: 'Nature',
        icon: '🪴',
        difficulty: 'Master Builder',
        estTime: '30 mins',
        description: 'Artfully twisted gnarled trunk branching into lush forest-green foliage pads resting in a deep ceramic basin.',
        bricks: [
            // Ceramic Dish Base (Dark Blue)
            { partId: '3020', color: 'DARK_BLUE', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3023', color: 'DARK_BLUE', x: 0, y: 0.4, z: 1.5, rotY: 0, layer: 1 },
            { partId: '3023', color: 'DARK_BLUE', x: 0, y: 0.4, z: -1.5, rotY: 0, layer: 1 },
            // Soil (Black & Dark Brown)
            { partId: '3068', color: 'BLACK', x: 0, y: 0.8, z: 0, rotY: 0, layer: 2 },
            // Trunk Base (Reddish Brown)
            { partId: '3005', color: 'BROWN', x: 0.2, y: 1.2, z: 0, rotY: 0, layer: 3 },
            { partId: '3005', color: 'BROWN', x: 0.4, y: 2.4, z: 0.2, rotY: 0, layer: 4 },
            { partId: '3004', color: 'BROWN', x: -0.2, y: 3.6, z: 0, rotY: 0, layer: 5 },
            // Canopy Branches
            { partId: '3022', color: 'GREEN', x: -0.8, y: 4.8, z: -0.4, rotY: 0, layer: 6 },
            { partId: '3022', color: 'GREEN', x: 0.6, y: 4.4, z: 0.4, rotY: 0, layer: 6 },
            { partId: '3021', color: 'LIME', x: -0.8, y: 5.2, z: -0.4, rotY: 0, layer: 7 },
            { partId: '3024', color: 'LIME', x: 0.6, y: 4.8, z: 0.4, rotY: 0, layer: 7 },
            { partId: '98138', color: 'PINK', x: -0.6, y: 5.6, z: -0.2, rotY: 0, layer: 8 },
            { partId: '98138', color: 'PINK', x: 0.4, y: 5.2, z: 0.6, rotY: 0, layer: 8 }
        ]
    },
    {
        id: 'mech',
        name: 'Compact Recon Mech Walker',
        category: 'Space & Sci-Fi',
        icon: '🤖',
        difficulty: 'Master Builder',
        estTime: '35 mins',
        description: 'Bipedal tactical sentinel with cockpit visor, heavy twin hydraulic legs, and dual shoulder cannons.',
        bricks: [
            // Left & Right Footpads
            { partId: '3023', color: 'DARK_GREY', x: -1.2, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3023', color: 'DARK_GREY', x: 1.2, y: 0, z: 0, rotY: 0, layer: 0 },
            // Lower Legs
            { partId: '3005', color: 'LIGHT_GREY', x: -1.2, y: 0.4, z: 0, rotY: 0, layer: 1 },
            { partId: '3005', color: 'LIGHT_GREY', x: 1.2, y: 0.4, z: 0, rotY: 1, layer: 1 },
            // Pelvis Crossbeam
            { partId: '3710', color: 'BLACK', x: 0, y: 1.6, z: 0, rotY: 0, layer: 2 },
            // Torso Chassis
            { partId: '3003', color: 'ORANGE', x: 0, y: 2.0, z: 0, rotY: 0, layer: 3 },
            // Cockpit Sensor Eye (Trans-Light Blue)
            { partId: '3024', color: 'TRANS_BLUE', x: 0, y: 3.2, z: 0.8, rotY: 0, layer: 4 },
            // Shoulders & Armor Plating
            { partId: '3004', color: 'DARK_GREY', x: 0, y: 3.2, z: 0, rotY: 0, layer: 4 },
            { partId: '54200', color: 'ORANGE', x: -1.2, y: 3.6, z: 0, rotY: 0, layer: 5 },
            { partId: '54200', color: 'ORANGE', x: 1.2, y: 3.6, z: 0, rotY: 0, layer: 5 },
            // Plasma Cannons
            { partId: '3062', color: 'LIGHT_GREY', x: -1.5, y: 4.4, z: 0.4, rotY: 0, layer: 6 },
            { partId: '3062', color: 'LIGHT_GREY', x: 1.5, y: 4.4, z: 0.4, rotY: 0, layer: 6 }
        ]
    },
    {
        id: 'pagoda',
        name: 'Neo-Tokyo Pagoda Shrine',
        category: 'Architecture',
        icon: '🗼',
        difficulty: 'Intermediate',
        estTime: '25 mins',
        description: 'Tiered sacred tower featuring sweeping red eaves, white masonry sanctum, and ceremonial gold finial.',
        bricks: [
            // Stone Foundation
            { partId: '3020', color: 'DARK_GREY', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
            // Tier 1 Sanctum
            { partId: '3003', color: 'WHITE', x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
            // Tier 1 Eaves (Overhanging Red Plates)
            { partId: '3710', color: 'DARK_RED', x: 0, y: 1.6, z: 0, rotY: 0, layer: 2 },
            { partId: '3710', color: 'DARK_RED', x: 0, y: 1.6, z: 0, rotY: Math.PI / 2, layer: 2 },
            // Tier 2 Sanctum
            { partId: '3004', color: 'WHITE', x: 0, y: 2.0, z: 0, rotY: 0, layer: 3 },
            // Tier 2 Eaves
            { partId: '3023', color: 'DARK_RED', x: 0, y: 3.2, z: 0, rotY: 0, layer: 4 },
            { partId: '3023', color: 'DARK_RED', x: 0, y: 3.2, z: 0, rotY: Math.PI / 2, layer: 4 },
            // Finial Spire (Gold)
            { partId: '4589', color: 'GOLD', x: 0, y: 3.6, z: 0, rotY: 0, layer: 5 },
            { partId: '3024', color: 'GOLD', x: 0, y: 4.8, z: 0, rotY: 0, layer: 6 }
        ]
    },
    {
        id: 'espresso',
        name: 'Vintage Countertop Espresso Machine',
        category: 'Pop Culture & Tech',
        icon: '☕',
        difficulty: 'Intermediate',
        estTime: '20 mins',
        description: 'Classic cafe espresso brewer with drip tray, dual portafilters, brass boiler dome, and ruby casing.',
        bricks: [
            // Chrome Drip Tray
            { partId: '3020', color: 'LIGHT_GREY', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3069', color: 'DARK_GREY', x: 0, y: 0.4, z: 1.0, rotY: 0, layer: 1 },
            // Ruby Red Boiler Body
            { partId: '3003', color: 'RED', x: 0, y: 0.4, z: -1.0, rotY: 0, layer: 1 },
            { partId: '3003', color: 'RED', x: 0, y: 1.6, z: -1.0, rotY: 0, layer: 2 },
            // Portafilter & Dispenser Head
            { partId: '3023', color: 'BLACK', x: 0, y: 1.6, z: 0.5, rotY: 0, layer: 2 },
            { partId: '3062', color: 'LIGHT_GREY', x: 0, y: 1.2, z: 0.5, rotY: 0, layer: 2 },
            // Cup on Drip Tray
            { partId: '3062', color: 'WHITE', x: 0, y: 0.8, z: 1.0, rotY: 0, layer: 2 },
            // Top Pressure Gauge & Warm Dome
            { partId: '3068', color: 'RED', x: 0, y: 2.8, z: -1.0, rotY: 0, layer: 3 },
            { partId: '4589', color: 'GOLD', x: 0, y: 3.2, z: -1.0, rotY: 0, layer: 4 }
        ]
    },
    {
        id: 'arcade',
        name: 'Retro Pocket Arcade Cabinet',
        category: 'Pop Culture & Tech',
        icon: '🕹️',
        difficulty: 'Intermediate',
        estTime: '25 mins',
        description: 'Coin-op nostalgia cabinet with vibrant purple livery, marquee header, and red joystick controls.',
        bricks: [
            // Pedestal Base
            { partId: '3003', color: 'BLACK', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3003', color: 'PURPLE', x: 0, y: 1.2, z: 0, rotY: 0, layer: 1 },
            // Control Panel Deck
            { partId: '3023', color: 'BLACK', x: 0, y: 2.4, z: 0.8, rotY: 0, layer: 2 },
            { partId: '98138', color: 'RED', x: -0.4, y: 2.8, z: 0.8, rotY: 0, layer: 3 }, // Joystick
            { partId: '98138', color: 'YELLOW', x: 0.4, y: 2.8, z: 0.8, rotY: 0, layer: 3 }, // Button
            // CRT Monitor Screen
            { partId: '3040', color: 'TRANS_BLUE', x: 0, y: 2.4, z: 0, rotY: 0, layer: 2 },
            // Marquee Backing & Header
            { partId: '3004', color: 'PURPLE', x: 0, y: 3.6, z: -0.5, rotY: 0, layer: 3 },
            { partId: '3069', color: 'YELLOW', x: 0, y: 4.8, z: 0, rotY: 0, layer: 4 }
        ]
    },
    {
        id: 'frog',
        name: 'Desk Tree Frog',
        category: 'Nature',
        icon: '🐸',
        difficulty: 'Beginner',
        estTime: '15 mins',
        description: 'Whimsical green amphibian with oversized bulging yellow eyes, coiled hind legs, and webbed feet.',
        bricks: [
            // Webbed Feet
            { partId: '3023', color: 'LIME', x: -1.5, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3023', color: 'LIME', x: 1.5, y: 0, z: 0, rotY: 0, layer: 0 },
            // Body Core
            { partId: '3003', color: 'LIME', x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
            { partId: '3020', color: 'LIME', x: 0, y: 1.6, z: 0, rotY: 0, layer: 2 },
            // Broad Head
            { partId: '3004', color: 'LIME', x: 0, y: 2.0, z: 0.8, rotY: 0, layer: 3 },
            // Bulbous Eyes (Yellow Tiles with Black Pupils)
            { partId: '98138', color: 'YELLOW', x: -0.8, y: 3.2, z: 0.8, rotY: 0, layer: 4 },
            { partId: '98138', color: 'YELLOW', x: 0.8, y: 3.2, z: 0.8, rotY: 0, layer: 4 },
            { partId: '3024', color: 'BLACK', x: -0.8, y: 3.6, z: 0.8, rotY: 0, layer: 5 },
            { partId: '3024', color: 'BLACK', x: 0.8, y: 3.6, z: 0.8, rotY: 0, layer: 5 }
        ]
    },
    {
        id: 'lighthouse',
        name: 'Micro Lighthouse & Rocky Shore',
        category: 'Architecture',
        icon: '💡',
        difficulty: 'Intermediate',
        estTime: '25 mins',
        description: 'Beacon tower with red-and-white nautical bands, rotating lantern beacon, and crashing sea spray.',
        bricks: [
            // Dark Stone Shoreline
            { partId: '3020', color: 'TRANS_BLUE', x: 0, y: 0, z: 0, rotY: 0, layer: 0 },
            { partId: '3023', color: 'DARK_GREY', x: 0, y: 0.4, z: 0, rotY: 0, layer: 1 },
            // Tower Base
            { partId: '3941', color: 'WHITE', x: 0, y: 0.8, z: 0, rotY: 0, layer: 2 },
            { partId: '3941', color: 'RED', x: 0, y: 2.0, z: 0, rotY: 0, layer: 3 },
            { partId: '3941', color: 'WHITE', x: 0, y: 3.2, z: 0, rotY: 0, layer: 4 },
            // Gallery Deck & Lantern
            { partId: '3022', color: 'BLACK', x: 0, y: 4.4, z: 0, rotY: 0, layer: 5 },
            { partId: '3062', color: 'TRANS_CLEAR', x: 0, y: 4.8, z: 0, rotY: 0, layer: 6 },
            // Cupola Roof
            { partId: '4589', color: 'RED', x: 0, y: 6.0, z: 0, rotY: 0, layer: 7 }
        ]
    }
];

window.INSPIRATION_MODELS = INSPIRATION_MODELS;
