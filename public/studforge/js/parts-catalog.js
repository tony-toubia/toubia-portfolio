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

window.LEGO_PARTS = LEGO_PARTS;
