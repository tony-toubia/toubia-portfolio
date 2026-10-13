import * as THREE from '../vendor/three.module.js';
import { LDrawLoader } from '../vendor/LDrawLoader.js';
import { loadPackedModel } from './ldraw-model.js';
window.THREE = THREE;
window.LDrawLoader = LDrawLoader;
window.loadPackedModel = loadPackedModel;
