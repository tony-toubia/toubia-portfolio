// StudForge builders, part 2: creatures, nature, objects, pixel standees and figures.
(() => {
    const H = window.FORGE.helpers;
    const PI = Math.PI;
    const reg = (b) => window.FORGE.builders.push(b);

    /** A palm: a leaning trunk, a hub, four fronds that overlap the hub, coconuts. */
    H.palm = (ctx, x, z, y) => {
        const { g, P } = ctx;
        for (let i = 0; i < 5; i++) g.part('3062', 'TAN', x + (i > 2 ? 1 : 0), z, y + i * 3);
        const hx = x + 1, hy = y + 15;
        g.part('4032', 'BROWN', hx, z, hy);
        g.part('3710', P.leaf, hx - 3, z, hy + 1, { rotY: PI / 2, w: 4, l: 1 }); g.part('3710', P.leaf, hx + 1, z + 1, hy + 1, { rotY: PI / 2, w: 4, l: 1 });
        g.part('3710', P.leaf, hx + 1, z - 3, hy + 1, { rotY: 0 }); g.part('3710', P.leaf, hx, z + 1, hy + 1, { rotY: 0 });
        g.part('98138', 'BROWN', hx, z, hy + 2); g.part('98138', 'BROWN', hx + 1, z + 1, hy + 2);
    };

    /* ── creatures ────────────────────────────────────────────── */

    // Body plans. legs = plates tall; body = [length, width, height(plates)]; neck = plates; head = [length, width, height]; tail = length.
    const ANIMALS = {
        dog: { legs: 4, body: [6, 2, 4], neck: 2, head: [3, 2, 3], tail: 2, ears: 'up', color: 'BROWN', title: 'Dog' },
        puppy: { legs: 3, body: [4, 2, 3], neck: 1, head: [3, 2, 3], tail: 1, ears: 'down', color: 'TAN', title: 'Puppy' },
        cat: { legs: 4, body: [5, 2, 3], neck: 2, head: [2, 2, 3], tail: 4, ears: 'up', color: 'DARK_GREY', title: 'Cat' },
        kitten: { legs: 3, body: [4, 2, 3], neck: 1, head: [2, 2, 3], tail: 3, ears: 'up', color: 'ORANGE', title: 'Kitten' },
        horse: { legs: 8, body: [7, 2, 5], neck: 6, head: [3, 2, 3], tail: 3, ears: 'up', mane: true, color: 'BROWN', title: 'Horse' },
        pony: { legs: 5, body: [5, 2, 4], neck: 4, head: [3, 2, 3], tail: 2, ears: 'up', mane: true, color: 'TAN', title: 'Pony' },
        unicorn: { legs: 8, body: [7, 2, 5], neck: 6, head: [3, 2, 3], tail: 3, ears: 'up', mane: true, horn: true, color: 'WHITE', title: 'Unicorn' },
        zebra: { legs: 8, body: [7, 2, 5], neck: 5, head: [3, 2, 3], tail: 3, ears: 'up', stripes: true, color: 'WHITE', title: 'Zebra' },
        cow: { legs: 5, body: [7, 3, 5], neck: 2, head: [3, 2, 3], tail: 2, ears: 'side', horns: true, spots: 'BLACK', color: 'WHITE', title: 'Cow' },
        pig: { legs: 3, body: [6, 3, 4], neck: 1, head: [3, 2, 3], tail: 1, ears: 'side', color: 'PINK', title: 'Pig' },
        sheep: { legs: 3, body: [6, 3, 5], neck: 1, head: [2, 2, 3], tail: 1, ears: 'side', color: 'WHITE', headColor: 'BLACK', title: 'Sheep' },
        goat: { legs: 5, body: [5, 2, 4], neck: 3, head: [3, 2, 3], tail: 1, ears: 'side', horns: true, color: 'TAN', title: 'Goat' },
        elephant: { legs: 7, body: [9, 4, 7], neck: 1, head: [4, 4, 5], tail: 2, ears: 'big', trunk: true, color: 'LIGHT_GREY', title: 'Elephant' },
        giraffe: { legs: 10, body: [7, 2, 5], neck: 13, head: [3, 2, 3], tail: 2, ears: 'up', spots: 'BROWN', color: 'YELLOW', title: 'Giraffe' },
        lion: { legs: 5, body: [7, 2, 5], neck: 2, head: [3, 3, 4], tail: 4, ears: 'up', mane: true, color: 'TAN', title: 'Lion' },
        tiger: { legs: 5, body: [7, 2, 5], neck: 2, head: [3, 2, 3], tail: 4, ears: 'up', stripes: true, color: 'ORANGE', title: 'Tiger' },
        bear: { legs: 5, body: [7, 3, 6], neck: 1, head: [3, 3, 4], tail: 1, ears: 'up', color: 'BROWN', title: 'Bear' },
        panda: { legs: 4, body: [6, 3, 6], neck: 1, head: [3, 3, 4], tail: 1, ears: 'up', color: 'WHITE', spots: 'BLACK', title: 'Panda' },
        'polar bear': { legs: 5, body: [7, 3, 6], neck: 1, head: [3, 3, 4], tail: 1, ears: 'up', color: 'WHITE', title: 'Polar Bear' },
        deer: { legs: 7, body: [6, 2, 4], neck: 5, head: [3, 2, 3], tail: 1, ears: 'up', antlers: true, color: 'BROWN', title: 'Deer' },
        reindeer: { legs: 7, body: [6, 2, 4], neck: 5, head: [3, 2, 3], tail: 1, ears: 'up', antlers: true, color: 'BROWN', nose: 'RED', title: 'Reindeer' },
        moose: { legs: 8, body: [7, 3, 5], neck: 4, head: [4, 2, 3], tail: 1, ears: 'up', antlers: true, color: 'BROWN', title: 'Moose' },
        wolf: { legs: 5, body: [6, 2, 4], neck: 3, head: [3, 2, 3], tail: 3, ears: 'up', color: 'LIGHT_GREY', title: 'Wolf' },
        fox: { legs: 4, body: [5, 2, 3], neck: 2, head: [3, 2, 3], tail: 4, ears: 'up', color: 'ORANGE', title: 'Fox' },
        rhino: { legs: 5, body: [8, 4, 6], neck: 1, head: [4, 3, 4], tail: 1, ears: 'up', horn: true, color: 'DARK_GREY', title: 'Rhinoceros' },
        hippo: { legs: 4, body: [8, 4, 6], neck: 1, head: [4, 3, 4], tail: 1, ears: 'up', color: 'PURPLE', title: 'Hippo' },
        camel: { legs: 8, body: [7, 2, 5], neck: 6, head: [3, 2, 3], tail: 2, ears: 'up', hump: true, color: 'TAN', title: 'Camel' },
        llama: { legs: 7, body: [6, 2, 4], neck: 7, head: [3, 2, 3], tail: 1, ears: 'up', color: 'WHITE', title: 'Llama' },
        alpaca: { legs: 6, body: [6, 2, 4], neck: 6, head: [3, 2, 3], tail: 1, ears: 'up', color: 'TAN', title: 'Alpaca' },
        rabbit: { legs: 2, body: [4, 2, 3], neck: 1, head: [2, 2, 3], tail: 1, ears: 'long', color: 'WHITE', title: 'Rabbit' },
        bunny: { legs: 2, body: [4, 2, 3], neck: 1, head: [2, 2, 3], tail: 1, ears: 'long', color: 'WHITE', title: 'Bunny' },
        mouse: { legs: 1, body: [3, 2, 2], neck: 1, head: [2, 2, 2], tail: 4, ears: 'round', color: 'LIGHT_GREY', title: 'Mouse' },
        hamster: { legs: 1, body: [4, 3, 3], neck: 1, head: [2, 2, 3], tail: 0, ears: 'round', color: 'ORANGE', title: 'Hamster' },
        triceratops: { legs: 5, body: [9, 4, 6], neck: 1, head: [4, 4, 4], tail: 5, ears: 'none', horns: true, frill: true, color: 'GREEN', title: 'Triceratops' },
        stegosaurus: { legs: 5, body: [9, 3, 6], neck: 2, head: [3, 2, 3], tail: 5, ears: 'none', plates: true, color: 'GREEN', title: 'Stegosaurus' },
        dragon: { legs: 6, body: [8, 3, 6], neck: 6, head: [4, 2, 3], tail: 7, ears: 'none', horns: true, wings: true, spikes: true, fire: true, color: 'RED', title: 'Dragon' },
        crocodile: { legs: 2, body: [8, 3, 3], neck: 1, head: [5, 2, 2], tail: 6, ears: 'none', spikes: true, color: 'GREEN', title: 'Crocodile' },
        alligator: { legs: 2, body: [8, 3, 3], neck: 1, head: [5, 2, 2], tail: 6, ears: 'none', spikes: true, color: 'GREEN', title: 'Alligator' },
        turtle: { legs: 2, body: [6, 4, 3], neck: 2, head: [2, 2, 2], tail: 1, ears: 'none', shell: true, color: 'GREEN', title: 'Turtle' },
        tortoise: { legs: 3, body: [6, 4, 3], neck: 2, head: [2, 2, 2], tail: 1, ears: 'none', shell: true, color: 'TAN', title: 'Tortoise' },
        frog: { legs: 2, body: [4, 3, 3], neck: 0, head: [3, 3, 2], tail: 0, ears: 'none', eyes: 'bulge', color: 'LIME', title: 'Tree Frog' },
    };
    const ALIASES = { doggy: 'dog', hound: 'dog', labrador: 'dog', corgi: 'puppy', dachshund: 'dog', husky: 'wolf', kitty: 'cat', stallion: 'horse', mare: 'horse', donkey: 'pony', mule: 'pony', bull: 'cow', ox: 'cow', boar: 'pig', hog: 'pig', lamb: 'sheep', ram: 'goat', mammoth: 'elephant', cheetah: 'tiger', leopard: 'tiger', jaguar: 'tiger', grizzly: 'bear', 'teddy bear': 'bear', stag: 'deer', elk: 'moose', hare: 'rabbit', rat: 'mouse', 'guinea pig': 'hamster', dino: 'stegosaurus', dinosaur: 'stegosaurus', gator: 'alligator', croc: 'crocodile', toad: 'frog', wyvern: 'dragon', drake: 'dragon' };

    reg({
        kind: 'creature', category: 'Nature', icon: '🐾',
        keys: Object.keys(ANIMALS).concat(Object.keys(ALIASES)),
        build(ctx) {
            const { g, P, sc, match, pick, chance, rnd } = ctx;
            const A = ANIMALS[ALIASES[match] || match];
            const S = Math.max(1, ctx.S);
            const col = P.explicit ? P.primary : A.color;
            const col2 = P.explicit && ctx.explicitColors.length > 1 ? P.secondary : (A.headColor || col);
            const bl = Math.max(3, Math.round(A.body[0] * S)), bw = Math.max(2, Math.round(A.body[1] * S)), bh = Math.round(A.body[2] * S);
            const legs = Math.round(A.legs * S), neck = Math.round(A.neck * S);
            const [hl, hw, hh] = A.head.map((v) => Math.max(1, Math.round(v * S)));
            const feats = [];
            // Dials: any creature can grow bat-wings; the tail can be dropped or stretched.
            const wings = ctx.declare({ id: 'wings', label: 'Wings', type: 'bool', default: !!A.wings });
            const tailMode = ctx.declare({ id: 'tail', label: 'Tail', type: 'choice', choices: ['none', 'normal', 'long'], default: 'normal' });
            const tl = tailMode === 'none' ? 0 : Math.round(A.tail * S * (tailMode === 'long' ? 1.8 : 1));
            // Base: grass with flowers (stretched back when the tail is long, so it never hangs off the edge).
            g.box(-4, bw + 3, tailMode === 'long' ? Math.min(-A.tail - 3, -tl - 3) : -A.tail - 3, bl + hl + neck + 4, 0, 0, P.ground, { noBrick: true });
            // Legs at the body's corners (round bricks for thin legs, square for heavy ones).
            const heavy = bw >= 3;
            if (legs > 0) for (const [x, z] of [[0, 0], [bw - 1, 0], [0, bl - 1], [bw - 1, bl - 1]].map(([x, z]) => heavy ? [x ? bw - 1 : 0, z ? bl - 2 : 0] : [x, z])) {
                if (heavy) g.box(x, x, z, z + 1, 1, legs, col2 === col ? col : col); else for (let y = 1; y <= legs; y += 3) g.part('3062', col, x, z, y, { hp: Math.min(3, legs - y + 1) });
            }
            const yB = legs + 1;
            if (legs > 0) H.ceiling(ctx, 0, bw - 1, 0, bl - 1, yB, col);
            g.box(0, bw - 1, 0, bl - 1, legs > 0 ? yB + 1 : yB, yB + bh - 1, col);
            if (A.stripes) for (let z = 1; z < bl; z += 2) g.box(0, bw - 1, z, z, yB + bh - 1, yB + bh - 1, 'BLACK', { noBrick: true });
            if (A.spots) for (let i = 0; i < bl; i++) if (chance(0.5)) g.set(Math.floor(rnd() * bw), yB + bh, Math.floor(rnd() * bl), A.spots, { noBrick: true });
            if (A.hump) g.part('3941', col, Math.max(0, Math.floor(bw / 2) - 1), Math.floor(bl / 2) - 1, yB + bh);
            if (A.shell) { g.box(0, bw - 1, 0, bl - 1, yB + bh, yB + bh, P.secondary === col ? 'DARK_GREEN' in window.LEGO_COLORS ? 'DARK_GREEN' : 'BROWN' : 'BROWN', { noBrick: true }); g.box(1, bw - 2, 1, bl - 2, yB + bh + 1, yB + bh + 2, 'BROWN'); g.part('553', 'BROWN', Math.floor(bw / 2) - 1, Math.floor(bl / 2) - 1, yB + bh + 3); feats.push('a domed shell'); }
            if (A.plates) { for (let z = 0; z < bl; z += 2) g.part('54200', P.accent === col ? 'ORANGE' : P.accent, Math.floor(bw / 2), z, yB + bh, { rotY: PI }); feats.push('a row of back plates'); }
            if (A.spikes) for (let z = 0; z < bl - 1; z += 2) g.part('54200', col2 === col ? 'DARK_GREY' : col2, Math.floor(bw / 2), z, yB + bh, { rotY: PI });
            if (wings) {
                const wz = Math.floor(bl / 2) - 1;
                for (const side of [-1, 1]) {
                    const x0 = side < 0 ? -1 : bw;
                    g.part('3034', col2 === col ? 'DARK_RED' : col2, side < 0 ? x0 - 7 : x0, wz, yB + bh - 1, { rotY: PI / 2, w: 8, l: 2 });
                    for (let i = 1; i <= 4; i++) g.part('3023', col2 === col ? 'DARK_RED' : col2, side < 0 ? x0 - 1 - i : x0 + i - 1, wz, yB + bh - 1 + i, { rotY: PI / 2, w: 2, l: 1 });
                    g.part('54200', col2 === col ? 'DARK_RED' : col2, side < 0 ? x0 - 5 : x0 + 4, wz, yB + bh + 4);
                }
                feats.push('stepped bat-wings');
            }
            // Neck: steps forward as it rises. Head sits on top.
            let hz = bl, hy = yB + bh;
            if (neck > 0) {
                const nx = Math.max(0, Math.floor(bw / 2) - 1), nw = Math.min(2, bw);
                for (let y = 0; y < neck; y += 3) { const step = Math.min(Math.floor(y / 3), 2); g.box(nx, nx + nw - 1, bl - 2 + step, bl - 1 + step, yB + bh + y, yB + bh + Math.min(y + 2, neck - 1), col); hz = bl - 1 + step + 1; }
                if (A.mane) for (let y = 0; y < neck - 1; y += 2) g.part('54200', col2 === col ? 'BLACK' : col2, nx, bl - 2 + Math.min(Math.floor(y / 3), 2), yB + bh + y, { rotY: PI });
                hy = yB + bh + neck;
            }
            const hx = Math.max(0, Math.floor((bw - hw) / 2));
            g.box(hx, hx + hw - 1, hz - 1, hz + hl - 2, hy, hy + hh - 1, col2);
            // Eyes on top of the head, ears, horns, nose.
            const eyeY = hy + hh;
            if (A.eyes === 'bulge') { g.part('3062', 'YELLOW', hx, hz + hl - 2, eyeY); g.part('3062', 'YELLOW', hx + hw - 1, hz + hl - 2, eyeY); g.part('98138', 'BLACK', hx, hz + hl - 2, eyeY + 3); g.part('98138', 'BLACK', hx + hw - 1, hz + hl - 2, eyeY + 3); }
            else { g.part('4073', 'WHITE', hx, hz + hl - 2, eyeY); g.part('4073', 'WHITE', hx + hw - 1, hz + hl - 2, eyeY); g.part('98138', 'BLACK', hx, hz + hl - 2, eyeY + 1); g.part('98138', 'BLACK', hx + hw - 1, hz + hl - 2, eyeY + 1); }
            if (A.nose) g.part('98138', A.nose, hx, hz + hl - 1, hy + hh - 1);
            if (A.ears === 'up') { g.part('54200', col2, hx, hz - 1, eyeY, { rotY: PI }); g.part('54200', col2, hx + hw - 1, hz - 1, eyeY, { rotY: PI }); }
            if (A.ears === 'long') { g.box(hx, hx, hz - 1, hz - 1, eyeY, eyeY + 4, col2); g.box(hx + hw - 1, hx + hw - 1, hz - 1, hz - 1, eyeY, eyeY + 4, col2); }
            if (A.ears === 'round') { g.part('4032', col2, hx - 1, hz - 2, eyeY); g.part('4032', col2, hx + hw - 1, hz - 2, eyeY); }
            if (A.ears === 'down' || A.ears === 'side') { g.part('3023', col2, hx - 1, hz - 1, hy + hh - 2, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', col2, hx + hw - 1, hz - 1, hy + hh - 2, { rotY: PI / 2, w: 2, l: 1 }); }
            if (A.ears === 'big') { g.part('3031', col2, hx - 3, hz - 1, hy + 1, { w: 4, l: 4 }); g.part('3031', col2, hx + hw - 1, hz - 1, hy + 1, { w: 4, l: 4 }); }
            if (A.horns) { g.part('4589', 'WHITE', hx, hz - 1, eyeY); g.part('4589', 'WHITE', hx + hw - 1, hz - 1, eyeY); feats.push('horns'); }
            if (A.horn) { g.part('4589', A.title === 'Unicorn' ? 'GOLD' : 'WHITE', hx + Math.floor(hw / 2), hz + hl - 2, eyeY); feats.push('a horn'); }
            if (A.antlers) { for (const x of [hx, hx + hw - 1]) { g.part('3062', 'TAN', x, hz - 1, eyeY); g.part('3023', 'TAN', x, hz - 2, eyeY + 3, { rotY: 0 }); g.part('4073', 'TAN', x, hz - 2, eyeY + 4); } feats.push('antlers'); }
            if (A.frill) { g.box(hx - 1, hx + hw, hz - 1, hz - 1, hy, hy + hh + 2, col2); feats.push('a bony frill'); }
            if (A.trunk) {
                // The trunk hangs under the face and curls forward: a round brick, a plate out, a round brick down, a plate out.
                const tx0 = hx + Math.floor(hw / 2), tz0 = hz + hl - 2;
                g.part('3062', col2, tx0, tz0, hy - 3); g.part('3023', col2, tx0, tz0, hy - 4, { rotY: 0 }); g.part('3062', col2, tx0, tz0 + 1, hy - 7); g.part('3023', col2, tx0, tz0 + 1, hy - 8, { rotY: 0 }); g.part('4073', col2, tx0, tz0 + 2, hy - 9);
                feats.push('a curling trunk', 'big ears');
            }
            if (A.fire) { g.part('3062', 'TRANS_ORANGE', hx + Math.floor(hw / 2), hz + hl - 1, hy, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('4589', 'TRANS_ORANGE', hx + Math.floor(hw / 2), hz + hl + 1, hy - 1, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); feats.push('a plume of fire'); }
            // Tail: 1x2 plates stepping back and down, each overlapping the one before.
            // It stops once it reaches the ground, so two plates never share a cell.
            const tx = Math.floor(bw / 2), droop = 1;
            let ty = yB + bh - 1, placed = 0;
            for (let i = 1; i <= tl; i++) { const ny = Math.max(1, ty - droop); if (ny === ty) break; ty = ny; g.part('3023', col, tx, -i, ty, { rotY: 0 }); placed = i; }
            if (placed > 2 && (A.title === 'Cat' || A.title === 'Fox' || A.title === 'Lion')) g.part('98138', col2 === col ? 'WHITE' : col2, tx, -placed, ty + 1);
            if (tailMode === 'long' && placed) feats.push('a long sweeping tail');
            for (let i = 0; i < 3; i++) H.flower(ctx, -4 - i, -2 - i, 1);
            if (chance(0.6)) H.tree(ctx, bw + 2, bl + hl + 1, 1, 'round');
            return { title: A.title, features: [`${legs > 0 ? 'four' : 'stubby'} legs`, `a ${bl}-stud body`, neck > 3 ? 'a long neck' : 'a sturdy neck', 'round-plate eyes', ...feats, 'a grassy base with flowers'] };
        }
    });

    reg({
        kind: 'smallcreature', category: 'Nature', icon: '🐦',
        keys: ['bird', 'parrot', 'eagle', 'owl', 'penguin', 'duck', 'chicken', 'rooster', 'hen', 'flamingo', 'toucan', 'pigeon', 'robin', 'swan', 'peacock', 'fish', 'goldfish', 'shark', 'whale', 'dolphin', 'orca', 'octopus', 'squid', 'snake', 'cobra', 'spider', 'tarantula', 'bee', 'bumblebee', 'butterfly', 'snail', 'crab', 'lobster', 'ladybug', 'ladybird', 'beetle', 'ant', 'jellyfish', 'seahorse', 'starfish', 't-rex', 'trex', 't rex', 'tyrannosaurus', 'raptor', 'velociraptor', 'kangaroo', 'ostrich', 'monkey', 'gorilla', 'ape', 'koala', 'sloth'],
        build(ctx) {
            const { g, P, sc, match, pick, chance } = ctx;
            const feats = [];
            const bird = ['bird', 'parrot', 'eagle', 'owl', 'penguin', 'duck', 'chicken', 'rooster', 'hen', 'flamingo', 'toucan', 'pigeon', 'robin', 'swan', 'peacock', 'ostrich'].includes(match);
            const sea = ['fish', 'goldfish', 'shark', 'whale', 'dolphin', 'orca', 'octopus', 'squid', 'jellyfish', 'seahorse', 'starfish'].includes(match);
            const biped = ['t-rex', 'trex', 't rex', 'tyrannosaurus', 'raptor', 'velociraptor', 'kangaroo', 'monkey', 'gorilla', 'ape', 'koala', 'sloth'].includes(match);
            if (bird) {
                const col = P.explicit ? P.primary : { parrot: 'RED', eagle: 'BROWN', owl: 'BROWN', penguin: 'BLACK', duck: 'YELLOW', chicken: 'WHITE', rooster: 'WHITE', hen: 'WHITE', flamingo: 'PINK', toucan: 'BLACK', pigeon: 'LIGHT_GREY', robin: 'BROWN', swan: 'WHITE', peacock: 'BLUE', ostrich: 'BLACK' }[match] || 'BLUE';
                const tall = match === 'flamingo' || match === 'ostrich', legs = tall ? 9 : 3;
                g.box(-4, 5, -4, 6, 0, 0, match === 'penguin' ? 'WHITE' : match === 'duck' || match === 'swan' ? P.water : P.ground, { noBrick: true });
                if (match === 'owl' || match === 'eagle' || match === 'parrot') { g.part('3062', 'BROWN', 0, 1, 1, { hp: 3 }); g.part('3062', 'BROWN', 1, 1, 1, { hp: 3 }); g.part('3020', 'BROWN', -1, 0, 4, { rotY: PI / 2, w: 4, l: 2 }); feats.push('a perch branch'); }
                const yB = (match === 'owl' || match === 'eagle' || match === 'parrot') ? 5 : 1 + legs;
                if (!(match === 'owl' || match === 'eagle' || match === 'parrot')) { for (let y = 1; y < yB; y += 3) { g.part('3062', match === 'flamingo' ? 'PINK' : 'ORANGE', 0, 1, y, { hp: Math.min(3, yB - y) }); g.part('3062', match === 'flamingo' ? 'PINK' : 'ORANGE', 1, 1, y, { hp: Math.min(3, yB - y) }); } }
                g.box(0, 1, 0, 2, yB, yB + 4, col);
                if (match === 'penguin') g.box(0, 1, 2, 2, yB, yB + 4, 'WHITE');
                g.part('3040', col, 0, -1, yB + 2, { rotY: PI }); g.part('3040', col, 1, -1, yB + 2, { rotY: PI });
                if (match === 'peacock') { for (let x = -2; x <= 3; x++) { g.box(x, x, -2, -2, yB + 3, yB + 10 - Math.abs(x * 2 - 1), x % 2 ? 'BLUE' : 'GREEN'); g.part('98138', 'TRANS_BLUE', x, -2, yB + 11 - Math.abs(x * 2 - 1)); } feats.push('a fanned tail of eye feathers'); }
                g.part('3023', col, -1, 1, yB + 3, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', col, 1, 1, yB + 3, { rotY: PI / 2, w: 2, l: 1 });
                g.part('54200', col, -1, 1, yB + 4, { rotY: PI }); g.part('54200', col, 2, 1, yB + 4, { rotY: PI });
                const ny = yB + 5, nl = match === 'flamingo' || match === 'swan' || match === 'ostrich' ? 5 : 1;
                g.box(0, 1, 2, 2, ny, ny + nl - 1, col);
                g.box(0, 1, 2, 3, ny + nl, ny + nl + 2, col);
                g.part('4073', 'WHITE', 0, 3, ny + nl + 3); g.part('4073', 'WHITE', 1, 3, ny + nl + 3); g.part('98138', 'BLACK', 0, 3, ny + nl + 4); g.part('98138', 'BLACK', 1, 3, ny + nl + 4);
                const beak = match === 'toucan' ? 'ORANGE' : match === 'parrot' ? 'LIGHT_GREY' : 'ORANGE';
                g.part('3023', beak, 0, 3, ny + nl, { rotY: 0 }); g.part('3023', beak, 1, 3, ny + nl, { rotY: 0 });
                g.part('54200', beak, 0, 4, ny + nl + 1, { rotY: 0 }); g.part('54200', beak, 1, 4, ny + nl + 1, { rotY: 0 });
                if (match === 'rooster') g.part('54200', 'RED', 0, 2, ny + nl + 3, { rotY: PI });
                if (match === 'owl') { g.part('54200', col, 0, 2, ny + nl + 3, { rotY: PI }); g.part('54200', col, 1, 2, ny + nl + 3, { rotY: PI }); }
                return { title: match === 'bird' ? 'Songbird' : match[0].toUpperCase() + match.slice(1), features: ['a plump brick body', 'cheese-slope wingtips and tail', 'a hooked beak', 'round-tile eyes', ...feats] };
            }
            if (sea) {
                const col = P.explicit ? P.primary : { shark: 'LIGHT_GREY', whale: 'BLUE', dolphin: 'LIGHT_GREY', orca: 'BLACK', octopus: 'PURPLE', squid: 'PINK', jellyfish: 'TRANS_BLUE', goldfish: 'ORANGE', seahorse: 'YELLOW', starfish: 'ORANGE' }[match] || 'BLUE';
                g.box(-5, 6, -6, 9, 0, 0, P.water, { noBrick: true });
                g.disc(0.5, 0.5, 5, 1, 1, 'TAN'); g.part('3062', 'TAN', -4, 1, 2); g.part('4589', 'TAN', 4, -1, 2);
                if (match === 'octopus' || match === 'squid' || match === 'jellyfish') {
                    g.part('3941', col, 0, 0, 2); g.part('4073', 'WHITE', 0, 1, 5); g.part('4073', 'WHITE', 1, 1, 5); g.part('98138', 'BLACK', 0, 1, 6); g.part('98138', 'BLACK', 1, 1, 6);
                    g.part('3941', col, 0, 0, 7); g.part('553', col, 0, 0, 10);
                    for (let i = 0; i < 8; i++) {
                        const a = i / 8 * PI * 2, dx = Math.round(Math.cos(a) * 2.2), dz = Math.round(Math.sin(a) * 2.2);
                        const along = Math.abs(dx) > Math.abs(dz), x0 = dx + (dx < 0 ? -1 : 0), z0 = dz + (dz < 0 ? -1 : 0);
                        g.part('3623', col, x0, z0, 2, { rotY: along ? PI / 2 : 0, w: along ? 3 : 1, l: along ? 1 : 3 });
                        g.part('98138', P.accent, along ? (dx < 0 ? x0 : x0 + 2) : x0, along ? z0 : (dz < 0 ? z0 : z0 + 2), 3);
                    }
                    return { title: match === 'jellyfish' ? 'Jellyfish' : match === 'squid' ? 'Squid' : 'Octopus', features: ['a domed round-brick head', 'eight radiating tentacles', 'sucker tiles', 'a sandy seabed with a reef'] };
                }
                if (match === 'starfish') { for (const [x, z, r] of [[0, 2, 0], [0, -4, 0], [2, 0, PI / 2], [-4, 0, PI / 2], [0, 0, 0]]) g.part('3623', col, x, z, 2, { rotY: r, w: r ? 3 : 1, l: r ? 1 : 3 }); g.part('98138', P.accent, 0, 0, 3); return { title: 'Starfish', features: ['five plated arms', 'a textured centre', 'a sandy seabed'] }; }
                // Fish, shark, whale, dolphin, seahorse: a tapered body on a clear stand.
                const L = sc(match === 'whale' || match === 'orca' ? 12 : 8), big = match === 'whale' || match === 'orca';
                H.stand(ctx, 0, Math.floor(L / 2), 2, 1); H.stand(ctx, 1, Math.floor(L / 2), 2, 1);
                g.box(0, 1, 1, L - 2, 5, 5, col, { noBrick: true }); g.box(0, 1, 0, L - 1, 6, big ? 10 : 8, col);
                if (big) g.box(-1, 2, 3, L - 4, 6, 8, col);
                if (match === 'orca') g.box(0, 1, L - 4, L - 2, 6, 6, 'WHITE', { noBrick: true });
                g.part('3039', col, 0, L - 2, big ? 11 : 9, { rotY: 0 }); g.part('3039', col, 0, 0, big ? 11 : 9, { rotY: PI });
                g.box(0, 1, 2, L - 3, big ? 11 : 9, big ? 11 : 9, col, { noBrick: true });
                g.part('54200', col, 0, Math.floor(L / 2), big ? 12 : 10, { rotY: PI }); g.part('54200', col, 1, Math.floor(L / 2), big ? 12 : 10, { rotY: PI });
                g.part('3023', col, -1, 1, big ? 8 : 7, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', col, 1, 1, big ? 8 : 7, { rotY: PI / 2, w: 2, l: 1 });
                g.part('3040', col, 0, -1, 6, { rotY: PI, w: 1, l: 2 }); g.part('3040', col, 1, -1, 6, { rotY: PI, w: 1, l: 2 });
                g.part('98138', 'BLACK', 0, L - 2, big ? 14 : 12); g.part('98138', 'BLACK', 1, L - 2, big ? 14 : 12);
                if (match === 'whale') g.part('3062', 'TRANS_CLEAR', 0, L - 4, big ? 12 : 10);
                return { title: { shark: 'Great White Shark', whale: 'Blue Whale', dolphin: 'Dolphin', orca: 'Orca', goldfish: 'Goldfish', seahorse: 'Seahorse' }[match] || 'Tropical Fish', features: ['a tapered sloped body', 'a dorsal fin and tail flukes', 'pectoral fins', 'swimming above a reef on a clear stand'] };
            }
            if (biped) {
                const dino = ['t-rex', 'trex', 't rex', 'tyrannosaurus', 'raptor', 'velociraptor'].includes(match);
                const col = P.explicit ? P.primary : dino ? 'GREEN' : match === 'gorilla' || match === 'ape' ? 'BLACK' : match === 'koala' ? 'LIGHT_GREY' : 'BROWN';
                g.box(-4, 5, -8, 7, 0, 0, P.ground, { noBrick: true });
                g.box(0, 0, 0, 2, 1, 2, col); g.box(3, 3, 0, 2, 1, 2, col);
                g.box(0, 0, 1, 1, 3, 8, col); g.box(3, 3, 1, 1, 3, 8, col);
                g.box(0, 3, 0, 3, 9, 14, col);
                if (dino) { for (let i = 1; i <= 6; i++) g.box(1, 2, -i, -i, Math.max(1, 9 - i), Math.max(1, 10 - i), col); }
                else g.part('3941', match === 'kangaroo' ? col : 'TAN', 1, -1, 9);
                g.box(1, 2, 3, 3, 15, 16, col);
                g.box(0, 3, 3, dino ? 7 : 5, 17, 20, col);
                g.part('4073', 'WHITE', 0, 3, 21); g.part('4073', 'WHITE', 3, 3, 21); g.part('98138', 'BLACK', 0, 3, 22); g.part('98138', 'BLACK', 3, 3, 22);
                if (dino) { for (let x = 0; x <= 3; x++) g.part('54200', 'WHITE', x, 7, 16, { rotY: 0 }); g.part('3023', col, -1, 3, 12, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', col, 3, 3, 12, { rotY: PI / 2, w: 2, l: 1 }); g.part('54200', col, -1, 3, 13, { rotY: 0 }); g.part('54200', col, 4, 3, 13, { rotY: 0 }); for (let z = 4; z <= 7; z++) g.part('54200', P.accent, 1, z, 21, { rotY: PI }); }
                else { g.part('3023', col, -1, 2, 12, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', col, 3, 2, 12, { rotY: PI / 2, w: 2, l: 1 }); g.part('4073', col, 0, 5, 21); g.part('4073', col, 3, 5, 21); g.part('98138', col, 0, 5, 22); g.part('98138', col, 3, 5, 22); }
                if (match === 'kangaroo') g.part('3022', 'TAN', 1, 3, 12);
                return { title: dino ? (match.startsWith('rapt') || match.startsWith('velo') ? 'Velociraptor' : 'Tyrannosaurus Rex') : match[0].toUpperCase() + match.slice(1), features: ['two heavy legs on wide feet', dino ? 'a long counterbalancing tail' : 'a hunched posture', dino ? 'a jaw full of cheese-slope teeth' : 'round ears', 'short arms'] };
            }
            // Bugs and small critters on a leaf.
            const col = P.explicit ? P.primary : { snake: 'GREEN', cobra: 'GREEN', spider: 'BLACK', tarantula: 'BROWN', bee: 'YELLOW', bumblebee: 'YELLOW', butterfly: 'PINK', snail: 'TAN', crab: 'RED', lobster: 'RED', ladybug: 'RED', ladybird: 'RED', beetle: 'DARK_GREY', ant: 'BLACK' }[match] || 'GREEN';
            g.box(-5, 6, -5, 6, 0, 0, P.ground, { noBrick: true });
            if (match === 'snake' || match === 'cobra') {
                let x = -4, z = -4, dir = 0; const path = [];
                for (let i = 0; i < 14; i++) { path.push([x, z]); if (dir === 0) { x++; if (x === 4) dir = 1; } else if (dir === 1) { z += 2; dir = 2; } else { x--; if (x === -4) dir = 3; if (dir === 3) { z += 2; dir = 0; } } }
                path.forEach(([px, pz], i) => g.box(px, px, pz, pz, 1, 1 + (i % 3 === 0 ? 1 : 0), i % 4 === 0 ? P.secondary : col, { noBrick: true }));
                g.box(x, x, z, z + 1, 1, 6, col); g.part('3040', col, x, z + 1, 7, { rotY: 0 }); g.part('98138', 'BLACK', x, z + 1, 10); g.part('3024', 'RED', x, z + 3, 1);
                return { title: match === 'cobra' ? 'Cobra' : 'Serpent', features: ['a winding striped body', 'a raised hooded head', 'a flicking red tongue'] };
            }
            if (match === 'snail') { g.part('3666', col, 0, 0, 1, { rotY: 0 }); g.part('3941', 'BROWN', 0, 1, 2); g.part('3941', 'ORANGE', 0, 1, 5); g.part('553', 'BROWN', 0, 1, 8); g.part('3005', col, 0, 5, 2); g.part('3062', col, 0, 5, 5); g.part('98138', 'BLACK', 0, 5, 8); return { title: 'Garden Snail', features: ['a spiral shell of round bricks', 'a stretched foot', 'eyestalks'] }; }
            if (match === 'butterfly') { g.box(0, 0, 0, 5, 1, 3, 'BLACK'); for (const [x, w] of [[-6, 6], [1, 6]]) { g.part('3795', col, x, 2, 1, { rotY: PI / 2, w: 6, l: 2 }); g.part('3020', col, x + (x < 0 ? 2 : 0), 4, 1, { rotY: PI / 2, w: 4, l: 2 }); g.part('98138', P.accent, x + (x < 0 ? 1 : 4), 2, 2); g.part('98138', P.secondary, x + (x < 0 ? 3 : 1), 4, 2); } g.part('3957', 'BLACK', 0, 5, 4); return { title: 'Butterfly', features: ['four plated wings with eye spots', 'a segmented body', 'antennae'] }; }
            const legsN = match === 'spider' || match === 'tarantula' ? 8 : 6;
            const wide = ['ladybug', 'ladybird', 'crab', 'lobster', 'beetle'].includes(match);
            g.box(wide ? -1 : 0, wide ? 2 : 1, 0, 3, 1, 3, col);
            if (match === 'bee' || match === 'bumblebee') { g.box(0, 1, 1, 1, 1, 3, 'BLACK'); g.part('3022', 'TRANS_CLEAR', -1, 1, 4); g.part('3022', 'TRANS_CLEAR', 1, 1, 4); g.part('54200', 'BLACK', 0, -1, 1, { rotY: PI }); }
            if (match === 'ladybug' || match === 'ladybird') { g.part('3069', 'BLACK', 0, 2, 4, { rotY: 0 }); g.part('3069', 'BLACK', 1, 2, 4, { rotY: 0 }); for (const [x, z] of [[-1, 0], [2, 1], [-1, 2], [2, 3]]) g.part('98138', 'BLACK', x, z, 4); }
            if (match === 'crab' || match === 'lobster') { g.part('3023', col, -3, 3, 1, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', col, 3, 3, 1, { rotY: PI / 2, w: 2, l: 1 }); g.part('54200', col, -3, 3, 2); g.part('54200', col, 4, 3, 2); }
            for (let i = 0; i < legsN / 2; i++) { g.part('3023', col, wide ? -3 : -2, i, 1, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', col, wide ? 2 : 1, i, 1, { rotY: PI / 2, w: 2, l: 1 }); }
            g.part('4073', 'WHITE', 0, 3, 4); g.part('4073', 'WHITE', 1, 3, 4); g.part('98138', 'BLACK', 0, 3, 5); g.part('98138', 'BLACK', 1, 3, 5);
            return { title: match[0].toUpperCase() + match.slice(1), features: [`${legsN} plated legs`, 'a segmented body', match === 'bee' || match === 'bumblebee' ? 'clear wings and a stinger' : 'round-tile eyes'] };
        }
    });

    /* ── nature ───────────────────────────────────────────────── */

    reg({
        kind: 'nature', category: 'Nature', icon: '🌳',
        keys: ['tree', 'oak', 'pine', 'fir', 'spruce', 'palm', 'palm tree', 'cherry blossom', 'cherry tree', 'sakura', 'willow', 'bonsai', 'forest', 'bush', 'flower', 'tulip', 'rose', 'sunflower', 'daisy', 'cactus', 'mushroom', 'toadstool', 'mountain', 'volcano', 'island', 'iceberg', 'garden', 'pond', 'waterfall', 'christmas tree', 'xmas tree', 'orchard', 'maple', 'birch', 'jungle', 'oasis', 'beach', 'glacier', 'hill', 'meadow'],
        build(ctx) {
            const { g, P, sc, match, chance, pick, rnd } = ctx;
            if (['mountain', 'volcano', 'hill', 'iceberg', 'glacier'].includes(match)) {
                const R = sc(7), vol = match === 'volcano', ice = match === 'iceberg' || match === 'glacier';
                g.box(-R - 2, R + 3, -R - 2, R + 3, 0, 0, ice ? P.water : P.ground, { noBrick: true });
                const rock = ice ? 'WHITE' : vol ? 'DARK_GREY' : 'LIGHT_GREY';
                let y = 1;
                for (let r = R; r > 0.6; r -= 1) { g.disc(0.5 + (rnd() - 0.5), 0.5 + (rnd() - 0.5), r, y, y + 2, r < 2.6 && !vol && !ice ? 'WHITE' : rock); y += 3; }
                if (vol) { g.disc(0.5, 0.5, 1.5, y - 3, y - 1, 'TRANS_ORANGE'); g.part('3062', 'TRANS_ORANGE', 0, 0, y); g.part('4589', 'TRANS_ORANGE', 0, 0, y + 3); for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + rnd() * 0.8, d = R + 1.5; const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d); if (!g.has(x, 1, z)) g.part('98138', 'TRANS_ORANGE', x, z, 1); } }
                else if (!ice) { for (let i = 0; i < 4; i++) H.tree(ctx, Math.round(Math.cos(i * 1.6) * (R + 1)), Math.round(Math.sin(i * 1.6) * (R + 1)), 1, 'pine'); g.box(-R - 1, -R + 1, R - 1, R + 2, 1, 1, P.water, { noBrick: true }); }
                return { title: vol ? 'Erupting Volcano' : ice ? 'Iceberg' : 'Snow-Capped Mountain', features: vol ? ['stacked rock tiers', 'a glowing lava crater', 'lava bombs on the slopes'] : ice ? ['stacked ice shelves', 'open water'] : ['stacked rock tiers', 'a snow cap', 'a ring of pine trees and an alpine lake'] };
            }
            if (match === 'island' || match === 'beach' || match === 'oasis') {
                const R = sc(6);
                g.box(-R - 3, R + 4, -R - 3, R + 4, 0, 0, P.water, { noBrick: true });
                g.disc(0.5, 0.5, R, 1, 1, 'TAN'); g.disc(0, 0, R - 2.5, 2, 2, match === 'oasis' ? P.water : 'TAN');
                H.palm(ctx, -2, -2, 2); H.palm(ctx, R - 3, 1, 2);
                g.box(1, 3, -3, -1, 2, 4, 'BROWN'); g.box(1, 3, -3, -1, 5, 5, 'TAN', { noBrick: true }); g.part('3039', P.leaf, 1, -2, 6, { rotY: 0 }); g.part('3039', P.leaf, 1, -4, 6, { rotY: PI }); g.part('3040', P.leaf, 3, -2, 6, { rotY: 0 }); g.part('3040', P.leaf, 3, -4, 6, { rotY: PI });
                g.part('3023', 'BROWN', R - 1, R - 2, 1, { rotY: 0 }); g.part('98138', 'RED', -R + 1, 2, 2);
                return { title: match === 'oasis' ? 'Desert Oasis' : 'Tropical Island', features: ['a sandy shore ringed by water', 'two palm trees with coconuts', 'a thatched beach hut', 'a jetty and a beach ball'] };
            }
            if (['flower', 'tulip', 'rose', 'sunflower', 'daisy'].includes(match)) {
                const col = P.explicit ? P.primary : { tulip: 'RED', rose: 'RED', sunflower: 'YELLOW', daisy: 'WHITE' }[match] || 'PINK';
                g.box(-3, 4, -3, 4, 0, 0, 'LIGHT_GREY', { noBrick: true });
                g.part('3941', 'ORANGE', 0, 0, 1); g.part('3941', 'ORANGE', 0, 0, 4); g.part('4032', 'BROWN', 0, 0, 7);
                g.box(0, 0, 0, 0, 8, 19, P.leaf);
                g.part('3023', P.leaf, -1, 0, 11, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', P.leaf, 0, 0, 14, { rotY: PI / 2, w: 2, l: 1 });
                const yF = 20;
                if (match === 'tulip') { g.part('3941', col, 0, 0, yF); g.part('4589', col, 0, 0, yF + 3); g.part('54200', col, 1, 1, yF + 3, { rotY: PI }); }
                else { g.part('3031', P.leaf, -1, -1, yF, { w: 4, l: 4 }); for (const [x, z] of [[-1, -1], [0, -1], [1, -1], [2, -1], [-1, 2], [0, 2], [1, 2], [2, 2], [-1, 0], [-1, 1], [2, 0], [2, 1]]) g.part('4073', col, x, z, yF + 1); g.part('14769', match === 'sunflower' ? 'BROWN' : 'YELLOW', 0, 0, yF + 1); }
                return { title: match === 'flower' ? 'Potted Flower' : match[0].toUpperCase() + match.slice(1), features: ['a terracotta pot', 'a round-brick stem with leaves', 'a ring of petal plates'] };
            }
            if (match === 'cactus') {
                g.box(-3, 4, -3, 4, 0, 0, 'TAN', { noBrick: true });
                g.part('3941', 'ORANGE', 0, 0, 1); g.part('3941', 'ORANGE', 0, 0, 4); g.part('4032', 'TAN', 0, 0, 7);
                for (let i = 0; i < 5; i++) g.part('3941', P.leaf, 0, 0, 8 + i * 3);
                g.part('3022', P.leaf, -2, 0, 11); g.part('3941', P.leaf, -2, 0, 12); g.part('3941', P.leaf, -2, 0, 15);
                g.part('3022', P.leaf, 2, 0, 14); g.part('3941', P.leaf, 2, 0, 15);
                g.part('98138', 'PINK', 0, 0, 23); g.part('98138', 'PINK', 1, 1, 23); g.part('4589', 'TAN', -3, 3, 1);
                return { title: 'Saguaro Cactus', features: ['a tall round-brick trunk', 'two upturned arms', 'pink blossoms', 'a sandy pot'] };
            }
            if (match === 'mushroom' || match === 'toadstool') {
                g.box(-4, 5, -4, 5, 0, 0, P.ground, { noBrick: true });
                g.part('3941', 'WHITE', 0, 0, 1); g.part('3941', 'WHITE', 0, 0, 4); g.part('3941', 'WHITE', 0, 0, 7);
                const cap = P.explicit ? P.primary : 'RED';
                const nb = { noBrick: true };
                g.disc(0.5, 0.5, 2.2, 10, 10, cap, nb); g.disc(0.5, 0.5, 2.7, 11, 11, cap, nb); g.disc(0.5, 0.5, 3.2, 12, 12, cap, nb); g.disc(0.5, 0.5, 2.7, 13, 13, cap, nb); g.disc(0.5, 0.5, 2.2, 14, 14, cap, nb);
                for (const [x, z, y] of [[-2, 0, 13], [3, 1, 13], [0, -2, 13], [1, 3, 13], [0, 0, 15], [2, 2, 14]]) g.part('98138', 'WHITE', x, z, y);
                g.part('3062', 'WHITE', -3, 3, 1); g.part('4032', cap, -4, 3, 4);
                return { title: 'Toadstool', features: ['a round-brick stem', 'a stacked domed cap', 'white spots', 'a baby mushroom'] };
            }
            if (match === 'pond' || match === 'waterfall' || match === 'garden' || match === 'meadow') {
                g.box(-6, 7, -6, 7, 0, 0, P.ground, { noBrick: true });
                g.disc(0.5, 0.5, 4, 1, 1, 'DARK_GREY'); g.disc(0.5, 0.5, 3, 1, 1, P.water);
                if (match === 'waterfall') { g.box(-2, 3, -6, -4, 1, 9, 'LIGHT_GREY'); g.box(0, 1, -5, -5, 10, 10, P.water, { noBrick: true }); g.box(0, 1, -3, -3, 1, 9, 'TRANS_CLEAR', { noBrick: true }); }
                g.part('4032', P.leaf, 0, 0, 2); g.part('98138', 'PINK', 1, 1, 3); g.part('4073', P.leaf, -2, 1, 2);
                H.tree(ctx, -5, 5, 1); H.tree(ctx, 6, -5, 1, 'pine'); for (let i = 0; i < 6; i++) H.flower(ctx, -5 + i * 2, -5, 1);
                for (let x = -5; x <= 6; x += 2) g.part('3069', 'TAN', x, 6, 1, { rotY: PI / 2 });
                return { title: match === 'waterfall' ? 'Waterfall Pool' : match === 'garden' ? 'Cottage Garden' : 'Lily Pond', features: ['a stone-edged pool', 'lily pads and flowers', 'trees and a tiled path', match === 'waterfall' ? 'a cliff with falling water' : 'a flower border'] };
            }
            // Trees.
            g.box(-5, 6, -5, 6, 0, 0, match === 'christmas tree' || match === 'xmas tree' ? 'WHITE' : P.ground, { noBrick: true });
            const feats = [];
            if (match === 'palm' || match === 'palm tree') { g.disc(0.5, 0.5, 4, 1, 1, 'TAN'); H.palm(ctx, 0, 0, 2); return { title: 'Palm Tree', features: ['a leaning round-brick trunk', 'radiating frond plates', 'coconuts', 'a sandy base'] }; }
            if (['pine', 'fir', 'spruce', 'christmas tree', 'xmas tree'].includes(match)) {
                const xmas = match === 'christmas tree' || match === 'xmas tree';
                g.part('3941', 'BROWN', 0, 0, 1); let y = 4;
                for (let r = 4; r >= 1; r -= 1) { g.disc(0.5, 0.5, r, y, y + 1, P.leaf); if (xmas && r > 1) for (let i = 0; i < r * 2; i++) { const a = i / (r * 2) * PI * 2; g.part('98138', pick(['RED', 'YELLOW', 'TRANS_BLUE', 'PINK']), Math.round(0.5 + Math.cos(a) * (r - 0.3)), Math.round(0.5 + Math.sin(a) * (r - 0.3)), y + 2); } y += 3; }
                g.part('4589', P.leaf, 0, 0, y - 1); g.part('4589', P.leaf, 1, 1, y - 1);
                if (xmas) { g.part('98138', 'YELLOW', 0, 0, y + 2); g.part('3022', 'RED', 3, 3, 1); g.part('3022', 'BLUE', -3, 2, 1); g.part('3022', 'YELLOW', 2, -3, 1); feats.push('baubles on every tier', 'a star', 'presents under the tree'); }
                return { title: xmas ? 'Christmas Tree' : 'Pine Tree', features: ['stacked tapering tiers of foliage', ...feats] };
            }
            if (match === 'bonsai') {
                g.shell(-3, 4, -2, 3, 1, 3, 'DARK_BLUE'); g.box(-2, 3, -1, 2, 1, 3, 'BLACK');
                g.box(0, 0, 0, 0, 4, 9, 'BROWN'); g.box(1, 1, 0, 0, 7, 12, 'BROWN'); g.box(-1, -1, 1, 1, 10, 12, 'BROWN');
                g.part('4032', P.leaf, -2, 0, 13); g.part('4032', P.leaf, 1, -1, 13); g.part('4032', P.leaf, -1, 1, 14); g.part('98138', 'PINK', -2, 0, 14); g.part('98138', 'PINK', 0, 2, 15); g.part('98138', 'PINK', 2, -1, 14);
                g.part('98138', 'LIGHT_GREY', -2, 2, 4); return { title: 'Bonsai Tree', features: ['a ceramic dish', 'a twisting trunk', 'foliage pads with blossom'] };
            }
            if (match === 'forest' || match === 'orchard' || match === 'jungle') { for (let i = 0; i < 5; i++) H.tree(ctx, -4 + (i % 3) * 4, -3 + Math.floor(i / 3) * 5, 1, i % 2 ? 'pine' : 'round'); for (let i = 0; i < 4; i++) H.flower(ctx, 5, -4 + i * 3, 1); return { title: match === 'orchard' ? 'Orchard' : 'Forest Glade', features: ['five mixed trees', 'wildflowers'] }; }
            // A broad-leaf tree: round-brick trunk, layered canopy.
            const canopy = match === 'cherry blossom' || match === 'cherry tree' || match === 'sakura' ? 'PINK' : match === 'maple' ? 'RED' : P.leaf;
            g.part('3941', 'BROWN', 0, 0, 1); g.part('3941', 'BROWN', 0, 0, 4); g.part('3941', 'BROWN', 0, 0, 7);
            g.disc(0.5, 0.5, 3, 10, 11, canopy); g.disc(0.5, 0.5, 3.5, 12, 13, canopy); g.disc(0.5, 0.5, 2.5, 14, 15, canopy); g.part('3941', canopy, 0, 0, 16); g.part('553', canopy, 0, 0, 19);
            // Dial: fruit tiles on the upper canopy, clear of the crown's round brick.
            const fruit = ctx.declare({ id: 'fruit', label: 'Fruit', type: 'bool', default: false });
            if (fruit) for (const [x, z] of [[-1, 0], [2, 1], [0, -1], [1, 2], [-1, 2], [2, -1]]) g.part('98138', canopy === 'RED' ? 'YELLOW' : 'RED', x, z, 16);
            if (canopy === 'PINK') for (let i = 0; i < 6; i++) g.part('98138', 'PINK', Math.round(Math.cos(i) * 4), Math.round(Math.sin(i) * 4), 1);
            if (match === 'willow') for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; g.box(Math.round(0.5 + Math.cos(a) * 3.5), Math.round(0.5 + Math.cos(a) * 3.5), Math.round(0.5 + Math.sin(a) * 3.5), Math.round(0.5 + Math.sin(a) * 3.5), 6, 9, canopy); }
            g.part('3062', 'LIGHT_GREY', 3, 3, 1); g.part('4073', 'LIGHT_GREY', -3, 2, 1);
            return { title: { oak: 'Oak Tree', 'cherry blossom': 'Cherry Blossom Tree', 'cherry tree': 'Cherry Tree', sakura: 'Sakura Tree', willow: 'Weeping Willow', maple: 'Maple Tree', birch: 'Birch Tree', bush: 'Garden Shrub' }[match] || 'Oak Tree', features: ['a thick round-brick trunk', 'a layered domed canopy', ...(fruit ? ['ripe fruit'] : []), canopy === 'PINK' ? 'fallen blossom' : 'rocks at the roots'] };
        }
    });

    /* ── objects ──────────────────────────────────────────────── */

    reg({
        kind: 'object', category: 'Pop Culture & Tech', icon: '🎁',
        keys: ['sword', 'dagger', 'axe', 'hammer', 'shield', 'crown', 'trophy', 'cup', 'mug', 'coffee', 'tea', 'teapot', 'kettle', 'espresso', 'espresso machine', 'coffee machine', 'coffee maker', 'camera', 'phone', 'smartphone', 'laptop', 'computer', 'pc', 'monitor', 'tv', 'television', 'console', 'controller', 'gamepad', 'arcade', 'arcade cabinet', 'arcade machine', 'piano', 'guitar', 'drum', 'drums', 'microphone', 'headphones', 'radio', 'boombox', 'lamp', 'lantern', 'candle', 'chair', 'armchair', 'sofa', 'couch', 'throne', 'table', 'desk', 'bed', 'bookshelf', 'book', 'chest', 'treasure chest', 'crate', 'barrel', 'gift', 'present', 'cake', 'birthday cake', 'cupcake', 'donut', 'doughnut', 'burger', 'hamburger', 'cheeseburger', 'pizza', 'hot dog', 'ice cream', 'sushi', 'apple', 'pumpkin', 'snowman', 'dice', 'clock', 'hourglass', 'globe', 'telescope', 'toaster', 'umbrella', 'suitcase', 'toolbox', 'lightbulb', 'light bulb', 'anchor', 'bell', 'typewriter', 'record player', 'turntable', 'vinyl', 'sandwich', 'taco', 'fries', 'popcorn', 'watermelon', 'strawberry', 'cookie', 'pie', 'wedding cake', 'castle cake', 'robot vacuum', 'rubber duck', 'dinosaur egg', 'egg', 'treasure', 'coins', 'potion', 'cauldron', 'wand', 'staff', 'bow', 'key', 'gem', 'diamond', 'crystal', 'ring', 'ruby', 'emerald'],
        build(ctx) {
            const { g, P, sc, match, pick, chance } = ctx;
            const col = P.primary, col2 = P.secondary;
            g.box(-5, 6, -5, 6, 0, 0, 'DARK_GREY', { noBrick: true });
            for (let x = -5; x <= 6; x += 2) { g.part('3069', 'LIGHT_GREY', x, -5, 1, { rotY: PI / 2 }); g.part('3069', 'LIGHT_GREY', x, 6, 1, { rotY: PI / 2 }); }
            const cols = (names, dflt) => (P.explicit ? P.primary : (names[match] || dflt));
            if (['cake', 'birthday cake', 'wedding cake', 'castle cake', 'cupcake', 'pie', 'cookie'].includes(match)) {
                const icing = cols({ cupcake: 'PINK', pie: 'TAN' }, 'WHITE');
                g.disc(0.5, 0.5, 4.5, 1, 1, 'LIGHT_GREY');
                if (match === 'cupcake') { g.disc(0.5, 0.5, 2.5, 2, 4, 'BROWN'); g.disc(0.5, 0.5, 3, 5, 6, icing); g.part('3941', icing, 0, 0, 7); g.part('553', icing, 0, 0, 10); g.part('98138', 'RED', 0, 0, 13); }
                else { g.disc(0.5, 0.5, 4, 2, 4, 'TAN'); g.disc(0.5, 0.5, 4, 5, 5, icing); g.disc(0.5, 0.5, 2.5, 6, 8, 'TAN'); g.disc(0.5, 0.5, 2.5, 9, 9, icing); if (match === 'wedding cake') { g.part('3941', 'TAN', 0, 0, 10); g.part('4032', icing, 0, 0, 13); } for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; g.part('3062', pick(['RED', 'BLUE', 'YELLOW']), Math.round(0.5 + Math.cos(a) * 1.8), Math.round(0.5 + Math.sin(a) * 1.8), 10); g.part('98138', 'TRANS_ORANGE', Math.round(0.5 + Math.cos(a) * 1.8), Math.round(0.5 + Math.sin(a) * 1.8), 13); } for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; g.part('98138', 'RED', Math.round(0.5 + Math.cos(a) * 3.5), Math.round(0.5 + Math.sin(a) * 3.5), 6); } }
                return { title: match === 'cupcake' ? 'Frosted Cupcake' : match === 'wedding cake' ? 'Wedding Cake' : 'Birthday Cake', features: ['layered sponge tiers', 'piped icing', match === 'cupcake' ? 'a swirl of frosting and a cherry' : 'lit candles and strawberries'] };
            }
            if (['burger', 'hamburger', 'cheeseburger', 'sandwich', 'taco'].includes(match)) {
                g.disc(0.5, 0.5, 4, 1, 1, 'WHITE');
                g.disc(0.5, 0.5, 3.5, 2, 3, 'TAN'); g.disc(0.5, 0.5, 3.5, 4, 4, 'LIME'); g.disc(0.5, 0.5, 3.5, 5, 6, 'BROWN'); g.disc(0.5, 0.5, 3.5, 7, 7, 'YELLOW'); g.disc(0.5, 0.5, 3.5, 8, 8, 'RED'); g.disc(0.5, 0.5, 3.5, 9, 10, 'TAN'); g.disc(0.5, 0.5, 2.5, 11, 11, 'TAN'); g.part('553', 'TAN', 0, 0, 12);
                for (const [x, z] of [[-1, 0], [2, 1], [0, 2], [1, -1]]) g.part('98138', 'WHITE', x, z, 12);
                g.part('3062', 'YELLOW', 3, -2, 2); g.part('3062', 'YELLOW', 2, -3, 2); g.part('3062', 'YELLOW', 3, -1, 2);
                return { title: 'Cheeseburger', features: ['a sesame bun', 'lettuce, patty, cheese and tomato', 'a side of fries'] };
            }
            if (['donut', 'doughnut'].includes(match)) { g.disc(0.5, 0.5, 4, 1, 1, 'WHITE'); g.ring(0.5, 0.5, 4, 2, 4, 'TAN'); g.ring(0.5, 0.5, 4, 5, 5, P.explicit ? P.primary : 'PINK'); for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; g.part('98138', pick(['YELLOW', 'BLUE', 'WHITE', 'RED']), Math.round(0.5 + Math.cos(a) * 3.5), Math.round(0.5 + Math.sin(a) * 3.5), 6); } return { title: 'Sprinkle Donut', features: ['a glazed ring', 'rainbow sprinkles'] }; }
            if (match === 'pizza') { g.disc(0.5, 0.5, 5, 1, 1, 'TAN'); g.disc(0.5, 0.5, 4.2, 2, 2, 'RED'); g.disc(0.5, 0.5, 4, 3, 3, 'YELLOW'); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + 0.3; g.part('98138', 'DARK_RED', Math.round(0.5 + Math.cos(a) * 2.5), Math.round(0.5 + Math.sin(a) * 2.5), 4); } g.part('14769', 'DARK_RED', 0, 0, 4); return { title: 'Pepperoni Pizza', features: ['a round crust', 'tomato sauce and cheese layers', 'pepperoni tiles'] }; }
            if (match === 'ice cream') { g.part('3942', 'TAN', 0, 0, 1); g.part('3022', 'TAN', 0, 0, 7); g.part('3941', 'PINK', 0, 0, 8); g.part('553', 'PINK', 0, 0, 11); g.part('3941', 'WHITE', 1, 1, 10); g.part('553', 'WHITE', 1, 1, 13); g.part('98138', 'RED', 0, 0, 14); return { title: 'Ice Cream Cone', features: ['a waffle cone', 'two scoops', 'a cherry on top'] }; }
            if (['mug', 'cup', 'coffee', 'tea'].includes(match)) { g.disc(0.5, 0.5, 4, 1, 1, 'WHITE'); g.ring(0.5, 0.5, 3, 2, 10, cols({}, 'RED')); g.disc(0.5, 0.5, 2, 2, 8, cols({}, 'RED')); g.disc(0.5, 0.5, 2, 9, 9, 'BROWN'); g.box(4, 4, 0, 1, 4, 8, cols({}, 'RED')); g.part('3023', cols({}, 'RED'), 3, 0, 9, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', cols({}, 'RED'), 3, 0, 3, { rotY: PI / 2, w: 2, l: 1 }); g.part('98138', 'TRANS_CLEAR', 0, 0, 10); return { title: ctx.has('tea') ? 'Teacup' : 'Coffee Mug', features: ['a round-walled mug', 'a brick handle', 'steaming coffee', 'a saucer'] }; }
            if (['teapot', 'kettle'].includes(match)) { g.disc(0.5, 0.5, 3, 1, 6, cols({}, 'BLUE')); g.disc(0.5, 0.5, 2, 7, 7, cols({}, 'BLUE')); g.part('4032', cols({}, 'BLUE'), 0, 0, 8); g.part('98138', 'BLACK', 0, 0, 9); g.part('3062', cols({}, 'BLUE'), 4, 0, 3, { rotZ: PI / 2, w: 2, l: 1, hp: 3, lie: true }); g.part('3062', cols({}, 'BLUE'), -3, 0, 4, { hp: 3 }); g.part('3023', cols({}, 'BLUE'), -3, 0, 7, { rotY: PI / 2, w: 2, l: 1 }); return { title: match === 'kettle' ? 'Kettle' : 'Teapot', features: ['a round body', 'a spout and handle', 'a lid with a knob'] }; }
            if (['espresso', 'espresso machine', 'coffee machine', 'coffee maker'].includes(match)) {
                const c = cols({}, 'RED');
                g.box(-2, 3, -2, 1, 1, 1, 'LIGHT_GREY', { noBrick: true }); g.box(-2, 3, -2, 0, 2, 10, c); g.box(-1, 2, 1, 1, 2, 2, 'DARK_GREY', { noBrick: true });
                g.part('3941', 'WHITE', 0, 1, 3); g.part('3023', 'BLACK', 0, 0, 8, { rotY: 0 }); g.part('3023', 'BLACK', 1, 0, 8, { rotY: 0 }); g.part('3062', 'LIGHT_GREY', 0, 2, 6); g.part('3062', 'LIGHT_GREY', 1, 2, 6);
                g.part('98138', 'LIGHT_GREY', -2, -2, 11); g.part('98138', 'LIGHT_GREY', 3, -2, 11); g.part('4032', 'GOLD', 0, -2, 11); g.part('553', 'GOLD', 0, -2, 12);
                g.part('3024', 'LIGHT_GREY', -2, 1, 7); g.part('98138', 'TRANS_RED', -2, 1, 8);
                return { title: 'Espresso Machine', features: ['a chrome drip tray', 'twin portafilters', 'a brass boiler dome', 'a pressure gauge and a cup'] };
            }
            if (['camera'].includes(match)) { g.box(-3, 4, -1, 1, 1, 6, 'BLACK'); g.box(-3, 4, -1, 1, 7, 8, 'LIGHT_GREY'); g.part('3941', 'BLACK', 0, 2, 3, { rotX: PI / 2, w: 2, l: 2, hp: 5, lie: true }); g.part('3062', 'TRANS_BLUE', 0, 4, 4, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('98138', 'RED', -2, 0, 9); g.part('3024', 'LIGHT_GREY', 1, 0, 9); g.part('3069', 'BLACK', 3, 0, 9, { rotY: 0 }); return { title: 'Rangefinder Camera', features: ['a leatherette body', 'a chrome top plate', 'a round lens barrel', 'a red shutter button'] }; }
            if (['laptop', 'computer', 'pc', 'monitor', 'tv', 'television', 'phone', 'smartphone', 'typewriter'].includes(match)) {
                const screen = match === 'laptop'; const w = sc(match === 'phone' || match === 'smartphone' ? 3 : 8);
                if (screen) { g.box(-4, 3, 0, 4, 1, 1, 'LIGHT_GREY', { noBrick: true }); g.box(-3, 2, 1, 3, 2, 2, 'BLACK', { noBrick: true }); g.box(-4, 3, 5, 5, 1, 7, 'LIGHT_GREY'); g.box(-3, 2, 5, 5, 2, 6, 'TRANS_BLUE', { noBrick: true }); return { title: 'Laptop', features: ['a tiled keyboard', 'an upright glass screen'] }; }
                g.box(-1, 2, 0, 1, 1, 2, 'DARK_GREY'); g.box(-w / 2 + 1, w / 2, 0, 0, 3, 3 + w - 1, 'BLACK'); g.box(-w / 2 + 2, w / 2 - 1, 0, 0, 4, 2 + w - 1, 'TRANS_BLUE', { noBrick: true });
                if (match === 'pc' || match === 'computer') { g.box(4, 5, 0, 3, 1, 10, 'DARK_GREY'); g.part('98138', 'TRANS_BLUE', 4, 3, 11); g.part('3020', 'LIGHT_GREY', -3, 2, 1, { rotY: PI / 2, w: 4, l: 2 }); }
                return { title: { tv: 'Flat-Screen TV', television: 'Television', monitor: 'Monitor', phone: 'Smartphone', smartphone: 'Smartphone', typewriter: 'Typewriter' }[match] || 'Desktop Computer', features: ['a slim screen on a stand', 'a glass panel', match === 'pc' || match === 'computer' ? 'a tower case with an RGB light' : 'a bezel'] };
            }
            if (['arcade', 'arcade cabinet', 'arcade machine', 'console', 'controller', 'gamepad'].includes(match)) {
                const c = cols({}, 'PURPLE');
                if (match === 'controller' || match === 'gamepad') { g.box(-4, 5, 0, 2, 1, 3, 'BLACK'); g.box(-4, -3, -1, -1, 1, 3, 'BLACK'); g.box(4, 5, -1, -1, 1, 3, 'BLACK'); g.part('98138', 'RED', 4, 1, 4); g.part('98138', 'GREEN', 5, 2, 4); g.part('98138', 'BLUE', 3, 2, 4); g.part('98138', 'YELLOW', 4, 3, 4); g.part('3024', 'DARK_GREY', -3, 2, 4); g.part('3024', 'DARK_GREY', -3, 0, 4); g.part('3024', 'DARK_GREY', -4, 1, 4); g.part('3024', 'DARK_GREY', -2, 1, 4); return { title: 'Game Controller', features: ['two grips', 'a d-pad and four coloured buttons'] }; }
                g.box(-2, 3, -2, 1, 1, 9, c); g.box(-2, 3, 2, 2, 7, 7, 'BLACK', { noBrick: true }); g.part('98138', 'RED', -1, 2, 8); g.part('98138', 'YELLOW', 1, 2, 8); g.part('98138', 'BLUE', 2, 2, 8);
                g.box(-2, 3, -2, 1, 10, 15, c); g.box(-1, 2, 1, 1, 10, 14, 'TRANS_BLUE', { noBrick: true }); g.box(-2, 3, -2, 1, 16, 17, 'YELLOW', { noBrick: true }); g.part('3069', 'BLACK', 0, 1, 18, { rotY: PI / 2 });
                return { title: 'Arcade Cabinet', features: ['a control deck with a joystick and buttons', 'a glass screen', 'a lit marquee header'] };
            }
            if (['guitar', 'piano', 'drum', 'drums', 'microphone', 'headphones', 'radio', 'boombox', 'record player', 'turntable', 'vinyl'].includes(match)) {
                if (match === 'piano') { g.box(-4, 3, -2, 1, 1, 9, 'BLACK'); g.box(-4, 3, 2, 2, 7, 7, 'WHITE', { noBrick: true }); for (let x = -4; x <= 3; x += 2) g.part('3070', 'BLACK', x, 2, 8); g.part('3034', 'BLACK', -4, -3, 10, { rotY: PI / 2, w: 8, l: 2 }); g.part('3062', 'BLACK', 3, -3, 13); g.part('3062', 'BLACK', 3, -3, 16); g.part('3031', 'BLACK', 0, -3, 19, { w: 4, l: 4 }); g.part('3005', 'BLACK', -1, 4, 1); g.part('3023', 'BLACK', -2, 4, 4, { rotY: PI / 2 }); return { title: 'Grand Piano', features: ['a keyboard of white and black tiles', 'a propped lid', 'a stool'] }; }
                if (match === 'guitar') { g.disc(0.5, 0.5, 3, 1, 2, cols({}, 'BROWN')); g.disc(1.5, 4.5, 2.5, 1, 2, cols({}, 'BROWN')); g.part('14769', 'BLACK', 0, 0, 3); g.box(1, 1, 5, 11, 3, 3, 'TAN', { noBrick: true }); g.box(0, 2, 12, 13, 3, 3, 'BLACK', { noBrick: true }); for (const [x, z] of [[0, 12], [2, 12], [0, 13], [2, 13]]) g.part('4073', 'LIGHT_GREY', x, z, 4); g.part('2431', 'LIGHT_GREY', 1, 2, 3, { rotY: 0 }); return { title: 'Acoustic Guitar', features: ['a figure-eight body', 'a sound hole', 'a fretted neck and tuning pegs'] }; }
                if (match === 'drum' || match === 'drums') { g.disc(0.5, 0.5, 3, 1, 5, cols({}, 'RED')); g.disc(0.5, 0.5, 3, 6, 6, 'WHITE'); g.part('3941', cols({}, 'RED'), 4, -3, 1); g.part('4032', 'WHITE', 4, -3, 4); g.part('3941', cols({}, 'RED'), -3, 3, 1); g.part('4032', 'WHITE', -3, 3, 4); g.part('3062', 'LIGHT_GREY', -3, -3, 1); g.part('3062', 'LIGHT_GREY', -3, -3, 4); g.part('4032', 'GOLD', -4, -4, 7); return { title: 'Drum Kit', features: ['a bass drum', 'two toms', 'a cymbal on a stand'] }; }
                if (match === 'microphone') { g.part('3941', 'BLACK', 0, 0, 1); for (let i = 0; i < 4; i++) g.part('3062', 'LIGHT_GREY', 0, 0, 4 + i * 3); g.part('3941', 'DARK_GREY', 0, 0, 16); g.part('553', 'LIGHT_GREY', 0, 0, 19); return { title: 'Stage Microphone', features: ['a weighted stand', 'a mesh capsule'] }; }
                if (match === 'headphones') { g.box(-4, -3, 0, 1, 1, 6, 'BLACK'); g.box(4, 5, 0, 1, 1, 6, 'BLACK'); g.box(-4, 5, 0, 1, 7, 8, cols({}, 'RED')); g.part('3941', cols({}, 'RED'), -4, 0, 3, { rotZ: PI / 2, w: 2, l: 2, hp: 5, lie: true }); g.part('3941', cols({}, 'RED'), 4, 0, 3, { rotZ: PI / 2, w: 2, l: 2, hp: 5, lie: true }); return { title: 'Headphones', features: ['two round ear cups', 'a padded headband'] }; }
                g.box(-4, 3, -1, 1, 1, 6, cols({}, 'DARK_GREY')); g.part('14769', 'BLACK', -4, -1, 7); g.part('14769', 'BLACK', 2, -1, 7); g.part('3069', 'TRANS_ORANGE', -1, 1, 7, { rotY: PI / 2 }); g.part('3957', 'LIGHT_GREY', 3, -1, 7);
                return { title: match === 'radio' ? 'Retro Radio' : match === 'record player' || match === 'turntable' || match === 'vinyl' ? 'Turntable' : 'Boombox', features: ['twin round speakers', 'a lit dial', 'an antenna'] };
            }
            if (['lamp', 'lantern', 'candle', 'lightbulb', 'light bulb'].includes(match)) { if (match === 'candle') { g.part('4032', 'GOLD', 0, 0, 1); g.part('3941', 'WHITE', 0, 0, 2); g.part('3941', 'WHITE', 0, 0, 5); g.part('98138', 'TRANS_ORANGE', 0, 0, 8); g.part('4589', 'TRANS_ORANGE', 0, 0, 9); return { title: 'Candle', features: ['a brass holder', 'a wax pillar with a flame'] }; } g.part('3941', 'DARK_GREY', 0, 0, 1); for (let i = 0; i < 3; i++) g.part('3062', 'LIGHT_GREY', 0, 0, 4 + i * 3); g.part('3958', cols({}, 'YELLOW'), -2, -2, 13, { w: 6, l: 6 }); g.shell(-2, 3, -2, 3, 14, 16, cols({}, 'YELLOW')); g.part('98138', 'TRANS_ORANGE', 0, 0, 14); return { title: match === 'lantern' ? 'Lantern' : 'Table Lamp', features: ['a weighted base', 'a slim stem', 'a brick shade with a warm bulb'] }; }
            if (['chair', 'armchair', 'sofa', 'couch', 'throne', 'bed', 'table', 'desk', 'bookshelf'].includes(match)) {
                const c = cols({ throne: 'GOLD', bed: 'BLUE' }, 'RED');
                if (match === 'table' || match === 'desk') { for (const [x, z] of [[-3, -1], [3, -1], [-3, 2], [3, 2]]) { g.part('3062', 'BROWN', x, z, 1); g.part('3062', 'BROWN', x, z, 4); } g.part('3036', 'BROWN', -3, -2, 7, { w: 8, l: 6, rotY: PI / 2 }); g.part('3941', 'WHITE', 0, 0, 8); g.part('98138', 'RED', 0, 0, 11); return { title: match === 'desk' ? 'Writing Desk' : 'Dining Table', features: ['four turned legs', 'a plated top', 'a vase of flowers'] }; }
                if (match === 'bed') { g.box(-2, 3, -3, 4, 1, 3, 'BROWN'); g.box(-2, 3, -3, 4, 4, 4, c, { noBrick: true }); g.box(-2, 3, -3, -2, 5, 5, 'WHITE', { noBrick: true }); g.part('3021', 'WHITE', -1, -3, 6, { rotY: PI / 2, w: 3, l: 2 }); g.box(-2, 3, -4, -4, 1, 9, 'BROWN'); return { title: 'Cosy Bed', features: ['a wooden frame and headboard', 'a quilt', 'pillows'] }; }
                if (match === 'bookshelf') { g.shell(-3, 2, 0, 0, 1, 15, 'BROWN'); for (let y = 1; y <= 13; y += 4) { g.box(-3, 2, 0, 0, y, y, 'BROWN', { noBrick: true }); for (let x = -2; x <= 1; x++) g.box(x, x, 0, 0, y + 1, y + 3, pick(['RED', 'BLUE', 'GREEN', 'YELLOW', 'WHITE'])); } return { title: 'Bookshelf', features: ['four shelves', 'rows of colourful books'] }; }
                const wide = match === 'sofa' || match === 'couch';
                const x0 = wide ? -3 : -1, x1 = wide ? 4 : 2;
                g.box(x0, x1, 0, 2, 1, 3, c); g.box(x0, x1, 0, 0, 4, match === 'throne' ? 14 : 8, c); g.box(x0, x0, 0, 2, 4, 6, c); g.box(x1, x1, 0, 2, 4, 6, c);
                g.box(x0 + 1, x1 - 1, 1, 2, 4, 4, match === 'throne' ? 'DARK_RED' : col2 === c ? 'WHITE' : col2, { noBrick: true });
                if (match === 'throne') { g.part('4589', 'GOLD', x0, 0, 15); g.part('4589', 'GOLD', x1, 0, 15); g.part('98138', 'TRANS_RED', 0, 0, 15); g.box(x0 - 1, x1 + 1, -1, 3, 1, 1, 'DARK_RED', { noBrick: true }); }
                return { title: { throne: 'Royal Throne', sofa: 'Sofa', couch: 'Sofa', armchair: 'Armchair' }[match] || 'Chair', features: ['a padded seat', 'a tall back', 'armrests', match === 'throne' ? 'gold finials and a jewel' : 'a cushion'] };
            }
            if (['chest', 'treasure chest', 'crate', 'barrel', 'treasure', 'coins', 'gift', 'present', 'suitcase', 'toolbox'].includes(match)) {
                if (match === 'barrel') { g.part('3941', 'BROWN', 0, 0, 1); g.part('3941', 'BROWN', 0, 0, 4); g.part('3941', 'BROWN', 0, 0, 7); g.part('14769', 'BROWN', 0, 0, 10); g.part('3062', 'DARK_GREY', -1, 0, 4); g.part('3062', 'DARK_GREY', 2, 1, 4); return { title: 'Wooden Barrel', features: ['stacked round staves', 'iron hoops'] }; }
                if (match === 'gift' || match === 'present') { const c = cols({}, 'RED'); g.box(-2, 3, -2, 3, 1, 6, c); g.box(0, 1, -2, 3, 1, 6, 'YELLOW'); g.box(-2, 3, 0, 1, 1, 6, 'YELLOW'); g.box(-2, 3, -2, 3, 7, 7, 'YELLOW', { noBrick: true }); g.part('4032', 'YELLOW', 0, 0, 8); g.part('98138', 'YELLOW', 0, 0, 9); return { title: 'Gift Box', features: ['wrapped sides', 'a ribbon and bow'] }; }
                const c = cols({ crate: 'TAN', suitcase: 'BROWN', toolbox: 'RED' }, 'BROWN');
                g.shell(-2, 3, -1, 1, 1, 5, c); g.box(-2, 3, -1, 1, 1, 1, c, { noBrick: true }); g.box(-2, 3, 0, 0, 2, 4, 'DARK_GREY');
                if (match === 'chest' || match === 'treasure chest' || match === 'treasure' || match === 'coins') { g.box(-1, 2, 0, 0, 2, 5, 'GOLD'); for (const [x, z] of [[-1, 0], [1, 0], [2, -1], [-2, 1]]) g.part('98138', 'GOLD', x, z, 6); g.part('98138', 'TRANS_RED', 0, 0, 6); g.part('3034', c, -2, 2, 6, { rotY: PI / 2, w: 6, l: 2 }); g.part('3037', c, -2, 2, 7, { rotY: PI, w: 4, l: 2 }); return { title: 'Treasure Chest', features: ['iron-banded planks', 'an open lid', 'spilling gold coins and a ruby'] }; }
                g.box(-2, 3, -1, 1, 6, 6, c, { noBrick: true }); g.part('3023', 'DARK_GREY', 0, 0, 7, { rotY: PI / 2 });
                return { title: match === 'toolbox' ? 'Toolbox' : match === 'suitcase' ? 'Suitcase' : 'Shipping Crate', features: ['a banded box', 'a handle'] };
            }
            if (['pumpkin', 'apple', 'watermelon', 'strawberry', 'egg', 'dinosaur egg', 'rubber duck'].includes(match)) {
                const c = cols({ apple: 'RED', watermelon: 'GREEN', strawberry: 'RED', egg: 'WHITE', 'dinosaur egg': 'LIME', 'rubber duck': 'YELLOW' }, 'ORANGE');
                g.disc(0.5, 0.5, 2.5, 1, 1, c); g.disc(0.5, 0.5, 3, 2, 6, c); g.disc(0.5, 0.5, 2.5, 7, 7, c); g.part('3941', c, 0, 0, 8); g.part('553', c, 0, 0, 11);
                if (match === 'pumpkin') { g.part('3062', 'BROWN', 0, 0, 14); g.part('3024', 'BLACK', -1, 3, 4); g.part('3024', 'BLACK', 2, 3, 4); for (let x = -1; x <= 2; x++) g.part('3024', 'BLACK', x, 3, 2); }
                if (match === 'apple') { g.part('3062', 'BROWN', 0, 0, 14); g.part('3023', 'GREEN', 1, 0, 14, { rotY: PI / 2, w: 2, l: 1 }); }
                if (match === 'strawberry') { for (let i = 0; i < 8; i++) g.part('98138', 'YELLOW', Math.round(0.5 + Math.cos(i) * 2.2), Math.round(0.5 + Math.sin(i) * 2.2), 7); g.part('4032', 'GREEN', 0, 0, 14); }
                if (match === 'rubber duck') { g.box(0, 1, 3, 3, 8, 10, c); g.part('54200', 'ORANGE', 0, 4, 8); g.part('54200', 'ORANGE', 1, 4, 8); g.part('98138', 'BLACK', 0, 3, 11); g.part('98138', 'BLACK', 1, 3, 11); }
                return { title: { pumpkin: 'Jack-o\'-Lantern', apple: 'Red Apple', watermelon: 'Watermelon', strawberry: 'Strawberry', egg: 'Egg', 'dinosaur egg': 'Dinosaur Egg', 'rubber duck': 'Rubber Duck' }[match], features: ['a rounded stacked body', match === 'pumpkin' ? 'a carved face and a stalk' : 'a stalk and leaf'] };
            }
            if (match === 'snowman') { g.box(-5, 6, -5, 6, 1, 1, 'WHITE', { noBrick: true }); g.disc(0.5, 0.5, 3, 2, 6, 'WHITE'); g.disc(0.5, 0.5, 2.5, 7, 7, 'WHITE'); g.disc(0.5, 0.5, 2, 8, 12, 'WHITE'); g.part('3941', 'WHITE', 0, 0, 13); g.part('553', 'WHITE', 0, 0, 16); g.part('98138', 'BLACK', 0, 2, 13); g.part('98138', 'BLACK', 1, 2, 13); g.part('4589', 'ORANGE', 0, 2, 14, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('3022', 'BLACK', 0, 0, 19); g.part('3062', 'BLACK', 0, 0, 20); g.part('3023', 'BROWN', -3, 0, 9, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', 'BROWN', 3, 0, 9, { rotY: PI / 2, w: 2, l: 1 }); for (const z of [3, 5, 7]) g.set(0, z, 1, 'BLACK', { noBrick: true }); g.box(-2, 3, 0, 1, 8, 8, 'RED', { noBrick: true }); return { title: 'Snowman', features: ['three stacked snowballs', 'a carrot nose and coal buttons', 'stick arms', 'a top hat and scarf'] }; }
            if (['dice', 'clock', 'hourglass', 'globe', 'telescope', 'toaster', 'umbrella', 'anchor', 'bell', 'robot vacuum', 'cauldron', 'potion'].includes(match)) {
                if (match === 'dice') { g.box(-2, 3, -2, 3, 1, 6, 'WHITE'); for (const [x, z] of [[-2, -2], [3, 3], [0, 0], [-2, 3], [3, -2]]) g.part('98138', 'BLACK', x, z, 7); return { title: 'Giant Die', features: ['a white cube', 'round-tile pips'] }; }
                if (match === 'globe') { g.part('3941', 'BROWN', 0, 0, 1); g.part('3062', 'GOLD', 0, 0, 4); g.disc(0.5, 0.5, 2, 7, 7, 'BLUE'); g.disc(0.5, 0.5, 3, 8, 12, 'BLUE'); g.disc(0.5, 0.5, 2, 13, 13, 'BLUE'); g.part('3941', 'BLUE', 0, 0, 14); g.part('553', 'BLUE', 0, 0, 17); for (const [x, z, y] of [[-2, 0, 9], [2, 1, 11], [0, 2, 10], [1, -2, 12]]) g.part('3022', 'GREEN', x, z, y + 3, { w: 2, l: 2 }); return { title: 'Desk Globe', features: ['a round blue planet', 'green continents', 'a brass stand'] }; }
                if (match === 'hourglass') { g.part('3031', 'BROWN', -1, -1, 1, { w: 4, l: 4 }); g.part('3941', 'TRANS_CLEAR', 0, 0, 2); g.part('3062', 'TRANS_CLEAR', 0, 0, 5); g.part('3941', 'TRANS_CLEAR', 0, 0, 8); g.part('3031', 'BROWN', -1, -1, 11, { w: 4, l: 4 }); g.part('4073', 'TAN', 0, 0, 3); g.part('3062', 'BROWN', -1, -1, 2); g.part('3062', 'BROWN', 2, 2, 2); g.part('3062', 'BROWN', -1, -1, 5); g.part('3062', 'BROWN', 2, 2, 5); g.part('3062', 'BROWN', -1, -1, 8); g.part('3062', 'BROWN', 2, 2, 8); return { title: 'Hourglass', features: ['two glass bulbs', 'wooden end plates and posts'] }; }
                if (match === 'telescope') { g.part('3941', 'BLACK', 0, 0, 1); for (let i = 0; i < 3; i++) g.part('3062', 'LIGHT_GREY', 0, 0, 4 + i * 3); g.part('3022', 'BLACK', 0, 0, 13); g.part('3941', 'WHITE', 0, 0, 14, { rotX: PI / 2, w: 2, l: 2, hp: 5, lie: true }); g.part('3062', 'WHITE', 0, 2, 15, { rotX: PI / 2, w: 1, l: 2, hp: 3, lie: true }); g.part('98138', 'TRANS_BLUE', 0, 4, 15, { rotX: PI / 2, w: 1, l: 1, hp: 2, lie: true }); return { title: 'Telescope', features: ['a tripod column', 'a round tube with a lens'] }; }
                if (match === 'toaster') { g.box(-2, 3, -1, 1, 1, 6, 'LIGHT_GREY'); g.part('3069', 'BLACK', 0, 0, 7, { rotY: PI / 2 }); g.part('3005', 'TAN', 0, 0, 8); g.part('3005', 'TAN', 1, 0, 8); g.part('98138', 'RED', 3, 1, 7); return { title: 'Toaster', features: ['a chrome body', 'two slices of toast', 'a lever'] }; }
                if (match === 'umbrella') { for (let i = 0; i < 4; i++) g.part('3062', 'BLACK', 0, 0, 1 + i * 3); g.disc(0.5, 0.5, 4, 13, 13, cols({}, 'RED')); g.disc(0.5, 0.5, 3, 14, 14, cols({}, 'RED')); g.disc(0.5, 0.5, 2, 15, 15, cols({}, 'RED')); g.part('4589', cols({}, 'RED'), 0, 0, 16); return { title: 'Umbrella', features: ['a long handle', 'a stepped canopy'] }; }
                if (match === 'anchor') { g.box(-3, 4, 0, 0, 1, 2, 'DARK_GREY'); g.box(0, 1, 0, 0, 3, 11, 'DARK_GREY'); g.part('3710', 'DARK_GREY', -1, 0, 12, { rotY: PI / 2, w: 4, l: 1 }); g.part('4073', 'DARK_GREY', 0, 0, 13); g.part('54200', 'DARK_GREY', -3, 0, 3, { rotY: -PI / 2 }); g.part('54200', 'DARK_GREY', 4, 0, 3, { rotY: PI / 2 }); return { title: 'Ship\'s Anchor', features: ['a curved crown', 'a shank and stock'] }; }
                if (match === 'bell') { g.part('3031', 'BROWN', -1, -1, 1, { w: 4, l: 4 }); g.disc(0.5, 0.5, 2.5, 2, 2, 'GOLD'); g.disc(0.5, 0.5, 2, 3, 6, 'GOLD'); g.part('3941', 'GOLD', 0, 0, 7); g.part('553', 'GOLD', 0, 0, 10); g.part('4073', 'GOLD', 0, 0, 13); return { title: 'Golden Bell', features: ['a flared gold body', 'a wooden base'] }; }
                if (match === 'cauldron' || match === 'potion') { g.disc(0.5, 0.5, 3, 1, 1, 'BLACK'); g.ring(0.5, 0.5, 3.5, 2, 5, 'BLACK'); g.disc(0.5, 0.5, 2.5, 5, 5, 'LIME'); g.part('3062', 'TRANS_CLEAR', 0, 0, 6); g.part('98138', 'LIME', 1, 1, 6); g.part('3062', 'BROWN', -3, 3, 1); g.part('3062', 'TRANS_ORANGE', -3, 3, 4); return { title: 'Witch\'s Cauldron', features: ['a round iron pot', 'bubbling green brew', 'a fire beside it'] }; }
                g.box(-2, 3, -2, 3, 1, 2, 'DARK_GREY'); g.disc(0.5, 0.5, 3, 1, 2, 'DARK_GREY'); g.part('14769', 'LIGHT_GREY', 0, 0, 3); g.part('98138', 'TRANS_BLUE', 0, 2, 3); return { title: 'Robot Vacuum', features: ['a round low body', 'a glowing status light'] };
            }
            if (['sword', 'dagger', 'axe', 'hammer', 'shield', 'wand', 'staff', 'bow', 'key'].includes(match)) {
                if (match === 'shield') { g.box(-3, 4, 0, 0, 1, 12, cols({}, 'BLUE')); g.box(0, 1, 0, 0, 1, 12, 'YELLOW'); g.box(-3, 4, 0, 0, 6, 7, 'YELLOW', { noBrick: true }); g.part('54200', cols({}, 'BLUE'), -3, 0, 13, { rotY: PI / 2 }); g.part('54200', cols({}, 'BLUE'), 4, 0, 13, { rotY: -PI / 2 }); g.box(-1, 2, 0, 0, 13, 14, cols({}, 'BLUE'), { noBrick: true }); g.box(-3, 4, 1, 1, 1, 2, 'DARK_GREY'); return { title: 'Knight\'s Shield', features: ['a heraldic cross', 'a curved top edge', 'a stand'] }; }
                // Blades stand on a plinth.
                g.box(-1, 2, -1, 1, 1, 2, 'DARK_GREY'); g.box(0, 1, 0, 0, 3, 4, 'BROWN'); g.box(0, 1, 0, 0, 5, 7, match === 'hammer' ? 'BROWN' : 'GOLD');
                if (match === 'axe') { g.box(0, 1, 0, 0, 8, 15, 'BROWN'); g.box(-2, -1, 0, 0, 10, 15, 'LIGHT_GREY'); g.part('3040', 'LIGHT_GREY', -2, 0, 16, { rotY: -PI / 2, w: 2, l: 1 }); g.part('54200', 'LIGHT_GREY', -2, 0, 8, { rotY: -PI / 2 }); return { title: 'Battle Axe', features: ['a long haft', 'a broad blade'] }; }
                if (match === 'hammer') { g.box(0, 1, 0, 0, 8, 13, 'BROWN'); g.box(-2, 3, 0, 0, 14, 17, 'LIGHT_GREY'); g.part('3069', 'DARK_GREY', 0, 0, 18, { rotY: PI / 2 }); return { title: 'War Hammer', features: ['a wooden shaft', 'a heavy steel head'] }; }
                if (match === 'wand' || match === 'staff') { for (let i = 0; i < 4; i++) g.part('3062', 'BROWN', 0, 0, 8 + i * 3); g.part('3062', 'TRANS_BLUE', 0, 0, 20); g.part('553', 'TRANS_BLUE', 0, 0, 23); return { title: 'Wizard\'s Staff', features: ['a gnarled shaft', 'a glowing crystal'] }; }
                if (match === 'key') { g.part('3941', 'GOLD', 0, 0, 8); g.part('3941', 'GOLD', 0, 0, 11); for (let i = 0; i < 3; i++) g.part('3062', 'GOLD', 0, 0, 14 + i * 3); g.part('3023', 'GOLD', 1, 0, 20, { rotY: PI / 2, w: 2, l: 1 }); g.part('3024', 'GOLD', 2, 0, 17); return { title: 'Golden Key', features: ['a round bow', 'a notched bit'] }; }
                if (match === 'bow') { g.box(0, 1, 0, 0, 8, 20, 'BROWN'); g.part('3040', 'BROWN', 0, 1, 21, { rotY: 0 }); g.part('3040', 'BROWN', 0, 1, 5, { rotY: PI }); g.box(0, 0, 3, 3, 5, 23, 'WHITE', { noBrick: true }); return { title: 'Longbow', features: ['a curved limb', 'a taut string'] }; }
                const blade = P.explicit ? P.primary : 'LIGHT_GREY';
                g.part('3710', 'GOLD', -1, 0, 8, { rotY: PI / 2, w: 4, l: 1 });
                const L = match === 'dagger' ? 6 : 14;
                g.box(0, 1, 0, 0, 9, 8 + L, blade); g.part('3040', blade, 0, 0, 9 + L, { rotY: PI, w: 1, l: 2 }); g.part('3040', blade, 1, 0, 9 + L, { rotY: PI, w: 1, l: 2 });
                g.part('98138', 'TRANS_RED', 0, 0, 3);
                return { title: match === 'dagger' ? 'Dagger' : 'Hero\'s Broadsword', features: ['a gold crossguard', 'a wrapped grip with a ruby pommel', 'a long steel blade'] };
            }
            if (['gem', 'diamond', 'crystal', 'ring', 'ruby', 'emerald', 'crown', 'trophy'].includes(match)) {
                if (match === 'crown') { g.disc(0.5, 0.5, 3, 1, 1, 'DARK_RED'); g.ring(0.5, 0.5, 3.5, 2, 4, 'GOLD'); for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2, x = Math.round(0.5 + Math.cos(a) * 3), z = Math.round(0.5 + Math.sin(a) * 3); g.box(x, x, z, z, 5, 6 + (i % 2) * 2, 'GOLD'); g.part('98138', i % 2 ? 'TRANS_RED' : 'TRANS_BLUE', x, z, 7 + (i % 2) * 2); } return { title: 'Royal Crown', features: ['a gold band', 'jewelled points', 'a velvet cushion'] }; }
                if (match === 'trophy') { g.box(-2, 3, -2, 3, 1, 3, 'BLACK'); g.part('3069', 'GOLD', 0, -2, 4, { rotY: PI / 2 }); g.part('3941', 'GOLD', 0, 0, 4); g.part('3062', 'GOLD', 0, 0, 7); g.part('3062', 'GOLD', 1, 1, 7); g.part('4032', 'GOLD', 0, 0, 10); g.part('3941', 'GOLD', 0, 0, 11); g.part('3941', 'GOLD', 0, 0, 14); g.part('3031', 'GOLD', -1, -1, 17, { w: 4, l: 4 }); g.part('3062', 'GOLD', -2, 0, 11, { hp: 3 }); g.part('3062', 'GOLD', 3, 1, 11, { hp: 3 }); g.part('3023', 'GOLD', -2, 0, 14, { rotY: PI / 2, w: 2, l: 1 }); g.part('3023', 'GOLD', 2, 1, 14, { rotY: PI / 2, w: 2, l: 1 }); return { title: 'Champion\'s Trophy', features: ['a marble base with a plaque', 'a gold cup with two handles'] }; }
                const c = P.explicit ? P.primary : { ruby: 'TRANS_RED', emerald: 'TRANS_BLUE', diamond: 'TRANS_CLEAR', crystal: 'TRANS_BLUE' }[match] || 'TRANS_BLUE';
                g.part('3031', 'BLACK', -1, -1, 1, { w: 4, l: 4 }); g.part('3022', 'GOLD', 0, 0, 2);
                g.box(0, 1, 0, 1, 3, 5, c); g.box(-1, 2, -1, 2, 6, 8, c); g.box(0, 1, 0, 1, 9, 11, c); g.part('4589', c, 0, 0, 12); g.part('4589', c, 1, 1, 12);
                if (match === 'ring') { g.ring(0.5, 0.5, 3, 3, 4, 'GOLD'); }
                return { title: { ring: 'Jewelled Ring', ruby: 'Ruby Gem', emerald: 'Emerald Gem', diamond: 'Diamond', crystal: 'Crystal' }[match] || 'Gemstone', features: ['a faceted translucent stone', 'a gold setting on a black plinth'] };
            }
            // Anything else in the object list: a simple plinth-mounted block sculpture of it.
            g.box(-2, 3, -2, 3, 1, 8, col); g.box(-1, 2, -1, 2, 9, 11, col2); g.part('98138', P.accent, 0, 0, 12);
            return { title: match[0].toUpperCase() + match.slice(1), features: ['a stacked block form', 'an accent cap'] };
        }
    });

    /* ── pixel standees ───────────────────────────────────────── */

    const BITMAPS = {
        heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
        star: ['...#...', '..###..', '#######', '.#####.', '..###..', '.#...#.'],
        skull: ['.#####.', '#######', '#.###.#', '#######', '.##.##.', '.#####.', '..#.#..'],
        invader: ['..#...#..', '...#.#...', '..#####..', '.##.#.##.', '#########', '#.#####.#', '#.#...#.#', '...#.#...'],
        ghost: ['..####..', '.######.', '##.##.##', '########', '########', '########', '#.##.##.'],
        smiley: ['..####..', '.######.', '##.##.##', '########', '#.####.#', '##....##', '.######.', '..####..'],
        bolt: ['...###', '..###.', '.###..', '#####.', '..###.', '.###..', '###...', '##....'],
        mushroom: ['..####..', '.#.##.#.', '########', '#.####.#', '..####..', '..#..#..', '..####..'],
        cat: ['#.....#', '##...##', '#######', '#.###.#', '#######', '.#####.', '.#.#.#.'],
        alien: ['.#...#.', '..#.#..', '.#####.', '##.#.##', '#######', '#.###.#', '#.#.#.#'],
        rocket: ['...#...', '..###..', '..###..', '.#####.', '.#####.', '#######', '#.###.#'],
        crown: ['#..#..#', '##.#.##', '#######', '#######', '.#####.'],
        letter: null,
    };
    const FONT = { A: ['.###.', '#...#', '#####', '#...#', '#...#'], B: ['####.', '#...#', '####.', '#...#', '####.'], C: ['.####', '#....', '#....', '#....', '.####'], D: ['####.', '#...#', '#...#', '#...#', '####.'], E: ['#####', '#....', '####.', '#....', '#####'], F: ['#####', '#....', '####.', '#....', '#....'], G: ['.####', '#....', '#..##', '#...#', '.####'], H: ['#...#', '#...#', '#####', '#...#', '#...#'], I: ['#####', '..#..', '..#..', '..#..', '#####'], J: ['#####', '...#.', '...#.', '#..#.', '.##..'], K: ['#...#', '#..#.', '###..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#####'], M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'], O: ['.###.', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '####.', '#....', '#....'], Q: ['.###.', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '####.', '#..#.', '#...#'], S: ['.####', '#....', '.###.', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..'], U: ['#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '.#.#.', '..#..'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'], Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'], Z: ['#####', '...#.', '..#..', '.#...', '#####'], '0': ['.###.', '#..##', '#.#.#', '##..#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '.###.'], '2': ['.###.', '#...#', '..##.', '.#...', '#####'], '3': ['####.', '....#', '.###.', '....#', '####.'], '4': ['#...#', '#...#', '#####', '....#', '....#'], '5': ['#####', '#....', '####.', '....#', '####.'], '6': ['.###.', '#....', '####.', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '..#..'], '8': ['.###.', '#...#', '.###.', '#...#', '.###.'], '9': ['.###.', '#...#', '.####', '....#', '.###.'] };

    /** A pixel-art wall, two studs thick, standing on a plinth. */
    H.standee = (ctx, rows, color, color2) => {
        const { g, P } = ctx;
        const w = rows[0].length, h = rows.length;
        g.box(-2, w + 1, -2, 3, 0, 0, 'DARK_GREY', { noBrick: true });
        g.box(-1, w, -1, 2, 1, 2, 'DARK_GREY'); g.box(-1, w, -1, 2, 3, 3, 'BLACK', { noBrick: true });
        // Under every lit pixel the column is filled in black, so the sprite
        // sits on its own dark "screen" and nothing hangs unsupported.
        for (let c = 0; c < w; c++) {
            let top = -1;
            for (let r = 0; r < h; r++) if (rows[h - 1 - r][c] !== '.') top = r;
            for (let r = 0; r <= top; r++) {
                const ch = rows[h - 1 - r][c];
                g.box(c, c, 0, 1, 4 + r * 3, 6 + r * 3, ch === '.' ? 'BLACK' : ch === '#' ? color : color2);
            }
        }
    };

    reg({
        kind: 'standee', category: 'Pop Culture & Tech', icon: '👾',
        keys: ['heart', 'star', 'skull', 'space invader', 'invader', 'ghost', 'pacman ghost', 'smiley', 'smiley face', 'emoji', 'lightning', 'lightning bolt', 'bolt', 'pixel', 'pixel art', 'sprite', '8-bit', 'retro game', 'pixel cat', 'logo', 'letter', 'initial', 'monogram', 'number'],
        build(ctx) {
            const { P, match, has } = ctx;
            const map = { heart: 'heart', star: 'star', skull: 'skull', 'space invader': 'invader', invader: 'invader', ghost: 'ghost', 'pacman ghost': 'ghost', smiley: 'smiley', 'smiley face': 'smiley', emoji: 'smiley', lightning: 'bolt', 'lightning bolt': 'bolt', bolt: 'bolt', 'pixel cat': 'cat' };
            let key = map[match] || (has('mushroom') ? 'mushroom' : has('alien') ? 'alien' : has('rocket') ? 'rocket' : has('crown') ? 'crown' : has('cat') ? 'cat' : has('ghost') ? 'ghost' : 'invader');
            const dflt = { heart: 'RED', star: 'YELLOW', skull: 'WHITE', invader: 'LIME', ghost: 'PINK', smiley: 'YELLOW', bolt: 'YELLOW', mushroom: 'RED', cat: 'BLACK', alien: 'LIME', rocket: 'WHITE', crown: 'GOLD' };
            H.standee(ctx, BITMAPS[key], P.explicit ? P.primary : dflt[key], P.explicit && ctx.explicitColors.length > 1 ? P.secondary : 'WHITE');
            const names = { heart: 'Pixel Heart', star: 'Pixel Star', skull: 'Pixel Skull', invader: 'Space Invader', ghost: 'Arcade Ghost', smiley: 'Smiley', bolt: 'Lightning Bolt', mushroom: 'Power-Up Mushroom', cat: 'Pixel Cat', alien: 'Pixel Alien', rocket: 'Pixel Rocket', crown: 'Pixel Crown' };
            return { title: names[key], features: ['a two-stud-thick pixel wall', 'a tiled plinth'] };
        }
    });

    /** The fallback for anything unrecognised: the idea's initials as a monogram standee. */
    H.monogram = (ctx, text) => {
        const letters = (text.toUpperCase().match(/[A-Z0-9]/g) || ['S']).slice(0, 2);
        const rows = [];
        for (let r = 0; r < 5; r++) rows.push(letters.map((L) => (FONT[L] || FONT.S)[r]).join('.'));
        H.standee(ctx, rows, ctx.P.primary, ctx.P.secondary);
        return letters.join('');
    };

    /* ── figures ──────────────────────────────────────────────── */

    reg({
        kind: 'figure', category: 'Castle & Fantasy', icon: '🧙',
        keys: ['person', 'man', 'woman', 'figure', 'character', 'hero', 'superhero', 'knight', 'wizard', 'witch', 'astronaut', 'minifig', 'minifigure', 'statue of a', 'ninja', 'pirate', 'santa', 'zombie', 'skeleton', 'king', 'queen', 'princess', 'prince', 'soldier', 'warrior', 'viking', 'samurai', 'cowboy', 'chef', 'doctor', 'firefighter', 'police officer', 'mummy', 'vampire', 'ghost figure', 'elf', 'dwarf', 'giant', 'ogre', 'troll', 'monster', 'yeti', 'bigfoot', 'mermaid', 'fairy', 'angel', 'devil', 'robot man', 'alien figure', 'spaceman', 'diver', 'surfer', 'skier', 'batman', 'superman', 'spider-man', 'spiderman', 'iron man', 'hulk', 'ninja turtle', 'mario', 'luigi', 'sonic', 'pikachu', 'link', 'zelda', 'kirby', 'minion', 'groot', 'yoda', 'darth vader', 'stormtrooper', 'jedi', 'sith', 'avatar', 'me', 'myself', 'tony'],
        build(ctx) {
            const { g, P, match, has } = ctx;
            const presets = { knight: ['LIGHT_GREY', 'LIGHT_GREY', 'DARK_GREY'], wizard: ['BLUE', 'BLUE', 'WHITE'], witch: ['BLACK', 'BLACK', 'LIME'], astronaut: ['WHITE', 'WHITE', 'TRANS_ORANGE'], spaceman: ['WHITE', 'WHITE', 'TRANS_ORANGE'], ninja: ['BLACK', 'BLACK', 'TAN'], pirate: ['DARK_RED', 'BROWN', 'TAN'], santa: ['RED', 'RED', 'PINK'], zombie: ['GREEN', 'BROWN', 'LIME'], skeleton: ['WHITE', 'WHITE', 'WHITE'], king: ['PURPLE', 'GOLD', 'TAN'], queen: ['PURPLE', 'GOLD', 'TAN'], princess: ['PINK', 'PINK', 'TAN'], prince: ['BLUE', 'GOLD', 'TAN'], soldier: ['GREEN', 'GREEN', 'TAN'], viking: ['BROWN', 'LIGHT_GREY', 'TAN'], samurai: ['DARK_RED', 'BLACK', 'TAN'], cowboy: ['BROWN', 'BLUE', 'TAN'], chef: ['WHITE', 'WHITE', 'TAN'], doctor: ['WHITE', 'BLUE', 'TAN'], firefighter: ['BLACK', 'YELLOW', 'TAN'], 'police officer': ['DARK_BLUE', 'DARK_BLUE', 'TAN'], mummy: ['WHITE', 'TAN', 'WHITE'], vampire: ['BLACK', 'DARK_RED', 'WHITE'], elf: ['GREEN', 'BROWN', 'TAN'], dwarf: ['BROWN', 'LIGHT_GREY', 'TAN'], giant: ['BROWN', 'TAN', 'TAN'], ogre: ['GREEN', 'BROWN', 'GREEN'], troll: ['GREEN', 'DARK_GREY', 'GREEN'], monster: ['PURPLE', 'PURPLE', 'LIME'], yeti: ['WHITE', 'WHITE', 'WHITE'], bigfoot: ['BROWN', 'BROWN', 'BROWN'], mermaid: ['GREEN', 'PINK', 'TAN'], fairy: ['PINK', 'PINK', 'TAN'], angel: ['WHITE', 'WHITE', 'TAN'], devil: ['RED', 'RED', 'RED'], superhero: ['BLUE', 'RED', 'TAN'], hero: ['BLUE', 'RED', 'TAN'], batman: ['BLACK', 'DARK_GREY', 'BLACK'], superman: ['BLUE', 'RED', 'TAN'], 'spider-man': ['RED', 'BLUE', 'RED'], spiderman: ['RED', 'BLUE', 'RED'], 'iron man': ['RED', 'GOLD', 'RED'], hulk: ['GREEN', 'PURPLE', 'GREEN'], 'ninja turtle': ['GREEN', 'BROWN', 'GREEN'], mario: ['RED', 'BLUE', 'TAN'], luigi: ['GREEN', 'BLUE', 'TAN'], sonic: ['BLUE', 'BLUE', 'TAN'], pikachu: ['YELLOW', 'YELLOW', 'YELLOW'], link: ['GREEN', 'TAN', 'TAN'], zelda: ['PINK', 'PURPLE', 'TAN'], kirby: ['PINK', 'PINK', 'PINK'], minion: ['YELLOW', 'BLUE', 'YELLOW'], groot: ['BROWN', 'BROWN', 'BROWN'], yoda: ['GREEN', 'BROWN', 'GREEN'], 'darth vader': ['BLACK', 'BLACK', 'BLACK'], stormtrooper: ['WHITE', 'WHITE', 'WHITE'], jedi: ['TAN', 'BROWN', 'TAN'], sith: ['BLACK', 'BLACK', 'TAN'], diver: ['BLACK', 'BLACK', 'TAN'], surfer: ['ORANGE', 'BLUE', 'TAN'], skier: ['RED', 'BLACK', 'TAN'], 'robot man': ['LIGHT_GREY', 'LIGHT_GREY', 'LIGHT_GREY'], 'alien figure': ['LIME', 'LIME', 'LIME'], tony: ['BLUE', 'DARK_GREY', 'TAN'], me: ['BLUE', 'DARK_GREY', 'TAN'], myself: ['BLUE', 'DARK_GREY', 'TAN'] };
            const [torso, legs, skin] = P.explicit ? [P.primary, P.secondary, 'TAN'] : (presets[match] || ['BLUE', 'DARK_GREY', 'TAN']);
            const big = ['giant', 'ogre', 'troll', 'hulk', 'yeti', 'bigfoot', 'groot', 'monster'].includes(match) || ctx.S > 1.2;
            const W = big ? 6 : 4;
            // Plinth with a name plaque.
            g.box(-4, W + 3, -3, 4, 0, 0, 'DARK_GREY', { noBrick: true }); g.box(-2, W + 1, -1, 2, 1, 2, 'LIGHT_GREY'); g.part('3069', 'GOLD', Math.floor(W / 2) - 1, 3, 1, { rotY: PI / 2 });
            // Legs, torso, arms, head.
            g.box(0, Math.floor(W / 2) - 1, 0, 1, 3, 8, legs); g.box(Math.floor(W / 2), W - 1, 0, 1, 3, 8, legs);
            g.box(0, W - 1, 0, 1, 9, 9, 'BLACK', { noBrick: true }); g.box(0, W - 1, 0, 1, 10, 15, torso);
            g.box(-1, -1, 0, 1, 10, 15, torso); g.box(W, W, 0, 1, 10, 15, torso); g.part('3023', skin, -1, 0, 16, { rotY: 0 }); g.part('3023', skin, W, 0, 16, { rotY: 0 });
            g.box(1, W - 2, 0, 1, 16, 16, skin, { noBrick: true });
            g.box(Math.floor(W / 2) - 1, Math.floor(W / 2), 0, 1, 17, 20, skin);
            g.part('98138', 'BLACK', Math.floor(W / 2) - 1, 1, 19, { rotX: PI / 2, w: 1, l: 1, hp: 2, lie: true }); g.part('98138', 'BLACK', Math.floor(W / 2), 1, 19, { rotX: PI / 2, w: 1, l: 1, hp: 2, lie: true });
            const hx = Math.floor(W / 2) - 1;
            const feats = ['a tiered plinth with a plaque', 'brick-built legs, torso and arms', 'a blocky head'];
            // Dial: heroes and vampires come caped; anyone else can borrow one.
            const capeDflt = ['superhero', 'hero', 'batman', 'superman', 'vampire'].includes(match);
            const cape = ctx.declare({ id: 'cape', label: 'Cape', type: 'bool', default: capeDflt });
            // Hats and props.
            if (['wizard', 'witch'].includes(match)) { g.part('3022', torso, hx, 0, 21); g.part('3942', torso, hx, 0, 22); g.part('3062', 'BROWN', W + 1, 0, 3); g.part('3062', 'BROWN', W + 1, 0, 6); g.part('3062', 'BROWN', W + 1, 0, 9); g.part('3062', 'BROWN', W + 1, 0, 12); g.part('98138', 'TRANS_BLUE', W + 1, 0, 15); feats.push('a pointed hat', 'a staff'); }
            else if (['knight', 'viking', 'samurai', 'king', 'queen', 'prince', 'princess'].includes(match)) { g.part('3022', 'GOLD', hx, 0, 21); g.part('4589', 'GOLD', hx, 0, 22); g.part('4589', 'GOLD', hx + 1, 1, 22); if (match === 'knight' || match === 'viking' || match === 'samurai') { g.part('3710', 'LIGHT_GREY', W + 1, 0, 6, { rotY: 0, w: 1, l: 4 }); g.part('3005', 'BROWN', W + 1, 0, 3); } feats.push('a crowned helm'); }
            else if (['astronaut', 'spaceman', 'diver', 'stormtrooper', 'darth vader'].includes(match)) { g.part('3941', torso, hx, 0, 21); g.part('553', match === 'darth vader' ? 'BLACK' : 'TRANS_CLEAR', hx, 0, 24); g.box(-1, W, 0, 0, 10, 15, 'LIGHT_GREY'); feats.push('a domed helmet', 'a backpack'); }
            else if (['santa', 'chef', 'firefighter', 'cowboy', 'pirate', 'police officer', 'mario', 'luigi'].includes(match)) { g.box(hx, hx + 1, 0, 1, 21, 22, match === 'chef' ? 'WHITE' : torso); g.part('3031', match === 'chef' ? 'WHITE' : torso, hx - 1, -1, 21, { w: 4, l: 4 }); if (match === 'santa') g.part('98138', 'WHITE', hx, 0, 23); feats.push('a brimmed hat'); }
            else if (capeDflt) { if (cape) { g.box(-1, W, -1, -1, 10, 20, match === 'batman' ? 'BLACK' : 'RED'); feats.push('a flowing cape'); } }
            else if (['devil', 'ogre', 'troll', 'monster', 'yoda', 'elf'].includes(match)) { g.part('54200', skin, hx, 0, 21, { rotY: PI }); g.part('54200', skin, hx + 1, 0, 21, { rotY: PI }); feats.push('pointed ears or horns'); }
            else if (['pikachu', 'kirby', 'minion', 'sonic'].includes(match)) { g.part('3062', skin, hx, 0, 21); g.part('3062', skin, hx + 1, 1, 21); }
            else { g.box(hx, hx + 1, 0, 1, 21, 21, match === 'skeleton' || match === 'mummy' ? skin : 'BROWN', { noBrick: true }); feats.push('a tuft of hair'); }
            if (match === 'skeleton' || match === 'zombie' || match === 'mummy') { g.part('98138', 'BLACK', 1, 1, 12, { rotX: PI / 2, w: 1, l: 1, hp: 2, lie: true }); }
            if (cape && !capeDflt) { g.box(-1, W, -1, -1, 10, 20, P.explicit ? P.secondary : 'RED'); feats.push('a flowing cape'); }
            const names = { person: 'Figure', man: 'Figure', woman: 'Figure', figure: 'Figure', character: 'Character', minifig: 'Mega Minifigure', minifigure: 'Mega Minifigure', 'statue of a': 'Statue', me: 'Mini Me', myself: 'Mini Me', tony: 'Tony', 'robot man': 'Tin Man', 'alien figure': 'Little Green Alien', 'ghost figure': 'Ghost' };
            return { title: names[match] || match.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), features: feats };
        }
    });
})();
