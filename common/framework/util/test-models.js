'use strict';

import { Loader } from './loader.js';
import { Model } from './model.js';

async function loadTestModel(assetsPath, modelPath, imagePath, scaleToUnitCubeAndCenter = true) {
    const loader = new Loader({ basePath: assetsPath });
    return {
        model: new Model(await loader.loadModel(modelPath), scaleToUnitCubeAndCenter),
        image: await loader.loadImage(imagePath),
    }
}

export async function loadBarrel(assetsPath = './common/assets', scaleToUnitCubeAndCenter = true) {
    return loadTestModel(assetsPath, 'models/barrel.json', 'images/barrel.webp', scaleToUnitCubeAndCenter);
}

export async function loadBunny(assetsPath = './common/assets', scaleToUnitCubeAndCenter = true) {
    return loadTestModel(assetsPath, 'models/bunny.json', 'images/brick.png', scaleToUnitCubeAndCenter);
}

export async function loadCrate(assetsPath = './common/assets', scaleToUnitCubeAndCenter = true) {
    return loadTestModel(assetsPath, 'models/crate.json', 'images/crate.webp', scaleToUnitCubeAndCenter);
}

export async function loadLamp(assetsPath = './common/assets', scaleToUnitCubeAndCenter = true) {
    return loadTestModel(assetsPath, 'models/lamp.json', 'images/lamp.webp', scaleToUnitCubeAndCenter);
}

export async function loadPhone(assetsPath = './common/assets', scaleToUnitCubeAndCenter = true) {
    return loadTestModel(assetsPath, 'models/phone.json', 'images/phone.webp', scaleToUnitCubeAndCenter);
}

export async function loadRadio(assetsPath = './common/assets', scaleToUnitCubeAndCenter = true) {
    return loadTestModel(assetsPath, 'models/radio.json', 'images/radio.webp', scaleToUnitCubeAndCenter);
}

export async function loadStatue(assetsPath = './common/assets', scaleToUnitCubeAndCenter = true) {
    return loadTestModel(assetsPath, 'models/statue.json', 'images/statue.webp', scaleToUnitCubeAndCenter);
}

export async function loadVase(assetsPath = './common/assets', scaleToUnitCubeAndCenter = true) {
    return loadTestModel(assetsPath, 'models/vase.json', 'images/vase.webp', scaleToUnitCubeAndCenter);
}
