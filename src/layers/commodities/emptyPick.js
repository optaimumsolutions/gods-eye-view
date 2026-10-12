/**
 * Whether a click landed on empty space, shared by every commodity layer's
 * click handler so they all agree on when a ground click deselects.
 *
 * `scene.pick` answers `undefined` over bare globe, but with the
 * photorealistic 3D tiles as the basemap a ground click picks the tileset
 * (`{ primitive: Cesium3DTileset }`, no `id`). The layers used to read any
 * pick as "a sibling layer's object" (`if (picked) return;`), so with the
 * tiles on a ground click never deselected (issue #74). A pick with no `id`
 * is nothing any layer can select; a pick that carries one belongs to some
 * layer and is left alone.
 *
 * Portable: no Cesium, no DOM.
 */
export function isEmptySpacePick(picked) {
  return picked?.id == null;
}
