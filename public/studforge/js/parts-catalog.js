// Official LEGO Parts Catalog
// Dimensions in stud units:
// 1 unit = 1 stud width (approx 8mm in real life)
// 1 brick height = 1.2 units (approx 9.6mm)
// 1 plate height = 0.4 units (approx 3.2mm) -> 3 plates = 1 brick
//
// `width` runs along X and `length` along Z when the part is not rotated.
// Slopes descend toward +Z: the high, studded end is at -Z.

const LEGO_PARTS = {};
const def = (id, name, category, width, length, height, extra = {}) => {
    LEGO_PARTS[id] = { id, name, category, width, length, height, hasStuds: true, ...extra };
};

// --- BRICKS ---
def('3005', 'Brick 1 x 1', 'Bricks', 1, 1, 1.2);
def('3004', 'Brick 1 x 2', 'Bricks', 1, 2, 1.2);
def('3622', 'Brick 1 x 3', 'Bricks', 1, 3, 1.2);
def('3010', 'Brick 1 x 4', 'Bricks', 1, 4, 1.2);
def('3009', 'Brick 1 x 6', 'Bricks', 1, 6, 1.2);
def('3008', 'Brick 1 x 8', 'Bricks', 1, 8, 1.2);
def('3003', 'Brick 2 x 2', 'Bricks', 2, 2, 1.2);
def('3002', 'Brick 2 x 3', 'Bricks', 2, 3, 1.2);
def('3001', 'Brick 2 x 4', 'Bricks', 2, 4, 1.2);
def('2456', 'Brick 2 x 6', 'Bricks', 2, 6, 1.2);
def('3007', 'Brick 2 x 8', 'Bricks', 2, 8, 1.2);

// --- PLATES ---
def('3024', 'Plate 1 x 1', 'Plates', 1, 1, 0.4, { isPlate: true });
def('3023', 'Plate 1 x 2', 'Plates', 1, 2, 0.4, { isPlate: true });
def('3623', 'Plate 1 x 3', 'Plates', 1, 3, 0.4, { isPlate: true });
def('3710', 'Plate 1 x 4', 'Plates', 1, 4, 0.4, { isPlate: true });
def('3666', 'Plate 1 x 6', 'Plates', 1, 6, 0.4, { isPlate: true });
def('3460', 'Plate 1 x 8', 'Plates', 1, 8, 0.4, { isPlate: true });
def('4477', 'Plate 1 x 10', 'Plates', 1, 10, 0.4, { isPlate: true });
def('3022', 'Plate 2 x 2', 'Plates', 2, 2, 0.4, { isPlate: true });
def('3021', 'Plate 2 x 3', 'Plates', 2, 3, 0.4, { isPlate: true });
def('3020', 'Plate 2 x 4', 'Plates', 2, 4, 0.4, { isPlate: true });
def('3795', 'Plate 2 x 6', 'Plates', 2, 6, 0.4, { isPlate: true });
def('3034', 'Plate 2 x 8', 'Plates', 2, 8, 0.4, { isPlate: true });
def('3832', 'Plate 2 x 10', 'Plates', 2, 10, 0.4, { isPlate: true });
def('3031', 'Plate 4 x 4', 'Plates', 4, 4, 0.4, { isPlate: true });
def('3032', 'Plate 4 x 6', 'Plates', 4, 6, 0.4, { isPlate: true });
def('3035', 'Plate 4 x 8', 'Plates', 4, 8, 0.4, { isPlate: true });
def('3958', 'Plate 6 x 6', 'Plates', 6, 6, 0.4, { isPlate: true });
def('3036', 'Plate 6 x 8', 'Plates', 6, 8, 0.4, { isPlate: true });
def('4073', 'Plate 1 x 1 Round', 'Plates', 1, 1, 0.4, { isPlate: true, isRound: true });
def('4032', 'Plate 2 x 2 Round', 'Plates', 2, 2, 0.4, { isPlate: true, isRound: true });

// --- TILES (SMOOTH TOP) ---
def('3070', 'Tile 1 x 1', 'Tiles', 1, 1, 0.4, { isPlate: true, hasStuds: false, isTile: true });
def('3069', 'Tile 1 x 2', 'Tiles', 1, 2, 0.4, { isPlate: true, hasStuds: false, isTile: true });
def('2431', 'Tile 1 x 4', 'Tiles', 1, 4, 0.4, { isPlate: true, hasStuds: false, isTile: true });
def('6636', 'Tile 1 x 6', 'Tiles', 1, 6, 0.4, { isPlate: true, hasStuds: false, isTile: true });
def('3068', 'Tile 2 x 2', 'Tiles', 2, 2, 0.4, { isPlate: true, hasStuds: false, isTile: true });
def('87079', 'Tile 2 x 4', 'Tiles', 2, 4, 0.4, { isPlate: true, hasStuds: false, isTile: true });
def('98138', 'Tile 1 x 1 Round', 'Tiles', 1, 1, 0.4, { isPlate: true, hasStuds: false, isTile: true, isRound: true });
def('14769', 'Tile 2 x 2 Round', 'Tiles', 2, 2, 0.4, { isPlate: true, hasStuds: false, isTile: true, isRound: true });

// --- SLOPES --- (`slopeStuds`: rows of studs on the flat top at the high end; `flat`: depth of that top in studs)
def('54200', 'Slope 30 1 x 1 x 2/3 (Cheese Slope)', 'Slopes', 1, 1, 0.8, { isSlope: true, hasStuds: false, slopeStuds: 0, flat: 0.15, lip: 0.12 });
def('85984', 'Slope 30 1 x 2 x 2/3', 'Slopes', 2, 1, 0.8, { isSlope: true, hasStuds: false, slopeStuds: 0, flat: 0.15, lip: 0.12 });
def('3040', 'Slope 45 2 x 1', 'Slopes', 1, 2, 1.2, { isSlope: true, slopeStuds: 1, flat: 1, lip: 0.3 });
def('3039', 'Slope 45 2 x 2', 'Slopes', 2, 2, 1.2, { isSlope: true, slopeStuds: 1, flat: 1, lip: 0.3 });
def('3038', 'Slope 45 2 x 3', 'Slopes', 3, 2, 1.2, { isSlope: true, slopeStuds: 1, flat: 1, lip: 0.3 });
def('3037', 'Slope 45 2 x 4', 'Slopes', 4, 2, 1.2, { isSlope: true, slopeStuds: 1, flat: 1, lip: 0.3 });
def('4286', 'Slope 33 3 x 1', 'Slopes', 1, 3, 1.2, { isSlope: true, slopeStuds: 1, flat: 1, lip: 0.25 });
def('3298', 'Slope 33 3 x 2', 'Slopes', 2, 3, 1.2, { isSlope: true, slopeStuds: 1, flat: 1, lip: 0.25 });

// --- ROUND, CONES & DOMES ---
def('3062', 'Brick 1 x 1 Round', 'Round', 1, 1, 1.2, { isRound: true });
def('3941', 'Brick 2 x 2 Round', 'Round', 2, 2, 1.2, { isRound: true });
def('4589', 'Cone 1 x 1 with Top Groove', 'Round', 1, 1, 1.2, { isCone: true });
def('3942', 'Cone 2 x 2 x 2', 'Round', 2, 2, 2.4, { isCone: true });
def('553', 'Brick 2 x 2 Round with Dome Top', 'Round', 2, 2, 1.2, { isDome: true, hasStuds: false });
def('3957', 'Antenna 1 x 4', 'Misc', 1, 1, 2.4, { isAntenna: true, hasStuds: false });

// --- WHEELS & AXLES ---
// A wheel's `width` is its thickness along X (its axle runs along X); `length` and `height` are its diameter.
// It hangs on an axle plate's side pin: place it with `links` to the plate so the engine knows it is fastened.
def('4600', 'Plate 2 x 2 with Wheel Holders', 'Wheels', 2, 2, 0.4, { isPlate: true, isAxlePlate: true });
def('2926', 'Plate 1 x 4 with Wheel Holders', 'Wheels', 1, 4, 0.4, { isPlate: true, isAxlePlate: true });
def('4624', 'Wheel 8mm D. x 6mm', 'Wheels', 1, 1, 1.0, { isWheel: true, diameter: 1.0, hasStuds: false });
def('3641', 'Tire 15mm D. x 6mm', 'Wheels', 1, 2, 2.0, { isTire: true, diameter: 1.9, hasStuds: false, ghost: true });
def('6014', 'Wheel 11mm D. x 12mm', 'Wheels', 1, 2, 1.4, { isWheel: true, diameter: 1.4, hasStuds: false });
def('6015', 'Tire 17mm D. x 6mm', 'Wheels', 1, 2, 2.1, { isTire: true, diameter: 2.1, hasStuds: false, ghost: true });
def('56904', 'Wheel 30.4mm D. x 20mm', 'Wheels', 2, 4, 3.8, { isWheel: true, diameter: 3.8, hasStuds: false });
def('56891', 'Tire 43.2mm D. x 22mm', 'Wheels', 2, 5, 5.4, { isTire: true, diameter: 5.4, hasStuds: false, ghost: true });
def('55423', 'Train Wheel with Axle Hole', 'Wheels', 1, 2, 2.2, { isWheel: true, diameter: 2.2, hasStuds: false });
def('3705', 'Technic Axle 4', 'Technic', 1, 4, 0.4, { isBar: true, hasStuds: false });
def('2780', 'Technic Pin with Friction', 'Technic', 1, 1, 0.4, { isPin: true, hasStuds: false });
def('3700', 'Technic Brick 1 x 2 with Hole', 'Technic', 1, 2, 1.2, { pinHoles: true });
def('3701', 'Technic Brick 1 x 4 with Holes', 'Technic', 1, 4, 1.2, { pinHoles: true });

// --- HINGES & TURNTABLES ---
def('3937', 'Hinge Brick 1 x 2 Base', 'Hinges', 1, 2, 1.2, { isHinge: 'base' });
def('3938', 'Hinge Brick 1 x 2 Top Plate', 'Hinges', 1, 2, 0.4, { isHinge: 'top', isPlate: true });
def('6134', 'Hinge Brick 2 x 2 Top Plate', 'Hinges', 2, 2, 0.4, { isHinge: 'top', isPlate: true });
def('2429', 'Hinge Plate 1 x 4 Swivel Base', 'Hinges', 1, 4, 0.4, { isHinge: 'base', isPlate: true });
def('2430', 'Hinge Plate 1 x 4 Swivel Top', 'Hinges', 1, 4, 0.4, { isHinge: 'top', isPlate: true });
def('44301', 'Hinge Plate 1 x 2 Locking with 1 Finger', 'Hinges', 1, 2, 0.4, { isHinge: 'finger', isPlate: true });
def('44302', 'Hinge Plate 1 x 2 Locking with 2 Fingers', 'Hinges', 1, 2, 0.4, { isHinge: 'fingers', isPlate: true });
def('3680', 'Turntable 2 x 2 Plate Base', 'Hinges', 2, 2, 0.4, { isTurntable: 'base', isPlate: true });
def('3679', 'Turntable 2 x 2 Plate Top', 'Hinges', 2, 2, 0.4, { isTurntable: 'top', isPlate: true });

// --- CLIPS & BARS ---
def('4085', 'Plate 1 x 1 with Clip Vertical', 'Clips', 1, 1, 0.4, { isClip: 'vertical', isPlate: true });
def('2555', 'Tile 1 x 1 with Clip', 'Clips', 1, 1, 0.4, { isClip: 'horizontal', isTile: true, hasStuds: false });
def('63868', 'Plate 1 x 2 with Clip Horizontal on End', 'Clips', 1, 3, 0.4, { isClip: 'end', isPlate: true });
def('60478', 'Plate 1 x 2 with Bar Handle on End', 'Clips', 1, 3, 0.4, { isBarHandle: true, isPlate: true });
def('48729', 'Bar 1L with Clip Mechanical Claw', 'Clips', 1, 1, 0.4, { isClip: 'claw', hasStuds: false });
def('30374', 'Bar 4L', 'Clips', 1, 1, 1.6, { isBar: true, hasStuds: false });
def('2335', 'Flag 2 x 2 Square', 'Clips', 1, 2, 1.6, { isFlag: true, hasStuds: false });
def('4617', 'Propeller 2 Blade 4 Diameter', 'Clips', 1, 4, 0.4, { isPropeller: true, hasStuds: false });

// --- BRACKETS & SIDEWAYS STUDS (SNOT) ---
def('99780', 'Bracket 1 x 2 - 1 x 2', 'Brackets', 1, 2, 0.4, { isBracket: 'down', isPlate: true });
def('99781', 'Bracket 1 x 2 - 1 x 2 Inverted', 'Brackets', 1, 2, 0.4, { isBracket: 'up', isPlate: true });
def('44728', 'Bracket 1 x 2 - 2 x 2', 'Brackets', 2, 2, 0.4, { isBracket: 'down2', isPlate: true });
def('87087', 'Brick 1 x 1 with Stud on Side', 'Brackets', 1, 1, 1.2, { sideStuds: 1 });
def('4070', 'Brick 1 x 1 Headlight', 'Brackets', 1, 1, 1.2, { isHeadlight: true });
def('11211', 'Brick 1 x 2 with 2 Studs on Side', 'Brackets', 1, 2, 1.2, { sideStuds: 2 });
def('15573', 'Plate 1 x 2 with 1 Stud (Jumper)', 'Plates', 1, 2, 0.4, { isPlate: true, isJumper: true });
def('87580', 'Plate 2 x 2 with Centre Stud (Jumper)', 'Plates', 2, 2, 0.4, { isPlate: true, isJumper: true });

// --- ARCHES, WINDOWS & DOORS ---
def('3659', 'Arch 1 x 4', 'Arches', 1, 4, 1.2, { isArch: true });
def('3455', 'Arch 1 x 6', 'Arches', 1, 6, 1.2, { isArch: true });
def('92950', 'Arch 1 x 8 x 2', 'Arches', 1, 8, 2.4, { isArch: true });
def('6005', 'Arch 1 x 3 x 2 Curved Top', 'Arches', 1, 3, 2.4, { isArch: true, round: true });
def('60592', 'Window 1 x 2 x 2', 'Windows', 1, 2, 2.4, { isWindow: true });
def('60601', 'Glass for Window 1 x 2 x 2', 'Windows', 1, 2, 2.4, { isGlass: true, hasStuds: false, ghost: true });
def('60593', 'Window 1 x 2 x 3', 'Windows', 1, 2, 3.6, { isWindow: true });
def('60602', 'Glass for Window 1 x 2 x 3', 'Windows', 1, 2, 3.6, { isGlass: true, hasStuds: false, ghost: true });
def('3853', 'Window 1 x 4 x 3', 'Windows', 1, 4, 3.6, { isWindow: true });
def('3855', 'Glass for Window 1 x 4 x 3', 'Windows', 1, 4, 3.6, { isGlass: true, hasStuds: false, ghost: true });
def('60596', 'Door Frame 1 x 4 x 6', 'Windows', 1, 4, 7.2, { isDoorFrame: true });
def('60623', 'Door 1 x 4 x 6 with Stud Handle', 'Windows', 1, 4, 7.2, { isDoor: true, hasStuds: false, ghost: true });
def('3185', 'Fence 1 x 4 x 2', 'Windows', 1, 4, 2.4, { isFence: true, hasStuds: false });

// --- WEDGES, CURVES & INVERTED SLOPES ---
def('43722', 'Wedge Plate 2 x 3 Right', 'Plates', 2, 3, 0.4, { isPlate: true, isWedge: 'right' });
def('43723', 'Wedge Plate 2 x 3 Left', 'Plates', 2, 3, 0.4, { isPlate: true, isWedge: 'left' });
def('41769', 'Wedge Plate 4 x 2 Right', 'Plates', 2, 4, 0.4, { isPlate: true, isWedge: 'right' });
def('41770', 'Wedge Plate 4 x 2 Left', 'Plates', 2, 4, 0.4, { isPlate: true, isWedge: 'left' });
def('11477', 'Slope Curved 2 x 1', 'Slopes', 1, 2, 0.8, { isSlope: true, curved: true, slopeStuds: 0 });
def('15068', 'Slope Curved 2 x 2 x 2/3', 'Slopes', 2, 2, 0.8, { isSlope: true, curved: true, slopeStuds: 0 });
def('6091', 'Brick 1 x 2 x 1 1/3 with Curved Top', 'Slopes', 1, 2, 1.6, { isSlope: true, curved: true, slopeStuds: 1 });
def('3665', 'Slope Inverted 45 2 x 1', 'Slopes', 1, 2, 1.2, { isInvertedSlope: true });
def('3660', 'Slope Inverted 45 2 x 2', 'Slopes', 2, 2, 1.2, { isInvertedSlope: true });
def('3747', 'Slope Inverted 33 3 x 2', 'Slopes', 2, 3, 1.2, { isInvertedSlope: true });
def('25269', 'Tile 1 x 1 Quarter Round', 'Tiles', 1, 1, 0.4, { isTile: true, hasStuds: false, quarterRound: true });
def('3063', 'Brick 2 x 2 Round Corner', 'Round', 2, 2, 1.2, { isRoundCorner: true });
def('4740', 'Dish 2 x 2 Inverted', 'Round', 2, 2, 0.4, { isDish: true });
def('3960', 'Dish 4 x 4 Inverted', 'Round', 4, 4, 0.8, { isDish: true });
def('2412', 'Tile 1 x 2 Grille', 'Tiles', 1, 2, 0.4, { isTile: true, hasStuds: false, grille: true });

window.LEGO_PARTS = LEGO_PARTS;
