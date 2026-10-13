import { LDrawLoader } from '../vendor/LDrawLoader.js';

export async function loadPackedModel(text, colors) {
    const loader = new LDrawLoader();
    const colorFile = new Blob([colors], { type: 'text/plain' });
    const colorUrl = URL.createObjectURL(colorFile);
    try { await loader.preloadMaterials(colorUrl); }
    finally { URL.revokeObjectURL(colorUrl); }
    // Packed files contain all dependencies. Bypass the loader's folder prefixes
    // for subparts and high-resolution primitives so it uses embedded files.
    const fileMap = {};
    for (const match of text.matchAll(/^1\s+\S+(?:\s+[-+\d.eE]+){12}\s+(.+)$/gm)) {
        const name = match[1].trim().replaceAll('\\', '/');
        fileMap[name] = name.toLowerCase();
    }
    loader.setFileMap(fileMap);
    const source = await new Promise((resolve, reject) => loader.parse(text, resolve, reject));
    return { loader, source };
}
