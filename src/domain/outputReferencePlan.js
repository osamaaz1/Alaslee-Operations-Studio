// Selects the minimum useful product references for each Output 1 image.

const referencePlan = Object.freeze({
  front: Object.freeze(["front", "angle"]),
  side: Object.freeze(["side", "temple", "angle"]),
  angle: Object.freeze(["angle", "front"]),
  model: Object.freeze(["front", "angle", "side"]),
  hero: Object.freeze(["front", "angle"]),
});

export function referencesForOutputRole(originalImages, outputRole) {
  const byRole = new Map(originalImages.map((image) => [image.role, image]));
  const plannedRoles = referencePlan[outputRole] || ["front", "side", "angle"];
  const selected = [];

  for (const role of plannedRoles) {
    const image = byRole.get(role);
    if (image) selected.push(image);
  }

  return selected.length > 0 ? selected : originalImages;
}
