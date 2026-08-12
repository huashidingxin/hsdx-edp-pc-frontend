export function coordinatesToWkt(coordinates) {
  // Flatten the coordinate array and ensure it is closed (first and last points are the same)
  const flatCoordinates = coordinates[0].map(([lon, lat]) => `${lon} ${lat}`).join(', ');

  // Ensure the polygon is closed by adding the first point at the end if not already present
  const firstPoint = coordinates[0][0];
  const lastPoint = coordinates[0][coordinates[0].length - 1];
  const closedCoordinates = firstPoint.toString() === lastPoint.toString()
    ? flatCoordinates
    : `${flatCoordinates}, ${firstPoint.join(' ')}`;

  return `POLYGON((${closedCoordinates}))`;
}
