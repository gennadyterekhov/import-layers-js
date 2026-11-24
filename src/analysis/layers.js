function layerIndex(file, layers) {
    const directories = file.split('/').slice(0, -1);
    const explicitLayer = layers.findIndex((layer) => layer.includes('/') && file.startsWith(`${layer}/`));
    return explicitLayer === -1
        ? layers.findIndex((layer) => directories.includes(layer))
        : explicitLayer;
}

export function createLayerRule(layers, files) {
    const layerByFile = new Map(files.map((file) => [file, layerIndex(file, layers)]));
    return (source, target) => {
        const fromIndex = layerByFile.get(source);
        const toIndex = layerByFile.get(target);
        if (fromIndex >= 0 && fromIndex < toIndex) {
            return { fromLayer: layers[fromIndex], toLayer: layers[toIndex] };
        }
        return null;
    };
}
