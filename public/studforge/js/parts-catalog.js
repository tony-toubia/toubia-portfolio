// Official LEGO Parts Catalog
// Dimensions in LEGO LDU / Grid Units:
// 1 unit = 1 stud width (approx 8mm in real life)
// 1 brick height = 1.2 units (approx 9.6mm)
// 1 plate height = 0.4 units (approx 3.2mm) -> 3 plates = 1 brick
// Stud height = 0.2 units (approx 1.6mm), stud diameter = 0.6 units (approx 4.8mm)

const LEGO_PARTS = {
    // --- BRICKS ---
    '3005': {
        id: '3005',
        name: 'Brick 1 x 1',
        category: 'Bricks',
        width: 1, length: 1, height: 1.2,
        isPlate: false, hasStuds: true
    },
    '3004': {
        id: '3004',
        name: 'Brick 1 x 2',
        category: 'Bricks',
        width: 1, length: 2, height: 1.2,
        isPlate: false, hasStuds: true
    },
    '3622': {
        id: '3622',
        name: 'Brick 1 x 3',
        category: 'Bricks',
        width: 1, length: 3, height: 1.2,
        isPlate: false, hasStuds: true
    },
    '3010': {
        id: '3010',
        name: 'Brick 1 x 4',
        category: 'Bricks',
        width: 1, length: 4, height: 1.2,
        isPlate: false, hasStuds: true
    },
    '3009': {
        id: '3009',
        name: 'Brick 1 x 6',
        category: 'Bricks',
        width: 1, length: 6, height: 1.2,
        isPlate: false, hasStuds: true
    },
    '3003': {
        id: '3003',
        name: 'Brick 2 x 2',
        category: 'Bricks',
        width: 2, length: 2, height: 1.2,
        isPlate: false, hasStuds: true
    },
    '3002': {
        id: '3002',
        name: 'Brick 2 x 3',
        category: 'Bricks',
        width: 2, length: 3, height: 1.2,
        isPlate: false, hasStuds: true
    },
    '3001': {
        id: '3001',
        name: 'Brick 2 x 4',
        category: 'Bricks',
        width: 2, length: 4, height: 1.2,
        isPlate: false, hasStuds: true
    },

    // --- PLATES ---
    '3024': {
        id: '3024',
        name: 'Plate 1 x 1',
        category: 'Plates',
        width: 1, length: 1, height: 0.4,
        isPlate: true, hasStuds: true
    },
    '3023': {
        id: '3023',
        name: 'Plate 1 x 2',
        category: 'Plates',
        width: 1, length: 2, height: 0.4,
        isPlate: true, hasStuds: true
    },
    '3623': {
        id: '3623',
        name: 'Plate 1 x 3',
        category: 'Plates',
        width: 1, length: 3, height: 0.4,
        isPlate: true, hasStuds: true
    },
    '3710': {
        id: '3710',
        name: 'Plate 1 x 4',
        category: 'Plates',
        width: 1, length: 4, height: 0.4,
        isPlate: true, hasStuds: true
    },
    '3022': {
        id: '3022',
        name: 'Plate 2 x 2',
        category: 'Plates',
        width: 2, length: 2, height: 0.4,
        isPlate: true, hasStuds: true
    },
    '3021': {
        id: '3021',
        name: 'Plate 2 x 3',
        category: 'Plates',
        width: 2, length: 3, height: 0.4,
        isPlate: true, hasStuds: true
    },
    '3020': {
        id: '3020',
        name: 'Plate 2 x 4',
        category: 'Plates',
        width: 2, length: 4, height: 0.4,
        isPlate: true, hasStuds: true
    },
    '3795': {
        id: '3795',
        name: 'Plate 2 x 6',
        category: 'Plates',
        width: 2, length: 6, height: 0.4,
        isPlate: true, hasStuds: true
    },
    '3034': {
        id: '3034',
        name: 'Plate 2 x 8',
        category: 'Plates',
        width: 2, length: 8, height: 0.4,
        isPlate: true, hasStuds: true
    },

    // --- TILES (SMOOTH TOP) ---
    '3070': {
        id: '3070',
        name: 'Tile 1 x 1',
        category: 'Tiles',
        width: 1, length: 1, height: 0.4,
        isPlate: true, hasStuds: false, isTile: true
    },
    '3069': {
        id: '3069',
        name: 'Tile 1 x 2',
        category: 'Tiles',
        width: 1, length: 2, height: 0.4,
        isPlate: true, hasStuds: false, isTile: true
    },
    '3068': {
        id: '3068',
        name: 'Tile 2 x 2',
        category: 'Tiles',
        width: 2, length: 2, height: 0.4,
        isPlate: true, hasStuds: false, isTile: true
    },
    '98138': {
        id: '98138',
        name: 'Tile 1 x 1 Round',
        category: 'Tiles',
        width: 1, length: 1, height: 0.4,
        isPlate: true, hasStuds: false, isTile: true, isRound: true
    },

    // --- SLOPES ---
    '54200': {
        id: '54200',
        name: 'Slope 30 1 x 1 x 2/3 (Cheese Slope)',
        category: 'Slopes',
        width: 1, length: 1, height: 0.8,
        isSlope: true, hasStuds: false
    },
    '3040': {
        id: '3040',
        name: 'Slope 45 2 x 1',
        category: 'Slopes',
        width: 1, length: 2, height: 1.2,
        isSlope: true, hasStuds: true, slopeStuds: 1
    },
    '3039': {
        id: '3039',
        name: 'Slope 45 2 x 2',
        category: 'Slopes',
        width: 2, length: 2, height: 1.2,
        isSlope: true, hasStuds: true, slopeStuds: 2
    },

    // --- ROUND & CYLINDERS ---
    '3062': {
        id: '3062',
        name: 'Brick 1 x 1 Round',
        category: 'Round',
        width: 1, length: 1, height: 1.2,
        isRound: true, hasStuds: true
    },
    '4589': {
        id: '4589',
        name: 'Cone 1 x 1 with Top Groove',
        category: 'Round',
        width: 1, length: 1, height: 1.2,
        isCone: true, hasStuds: true
    },
    '3941': {
        id: '3941',
        name: 'Brick 2 x 2 Round',
        category: 'Round',
        width: 2, length: 2, height: 1.2,
        isRound: true, hasStuds: true
    }
};

window.LEGO_PARTS = LEGO_PARTS;
