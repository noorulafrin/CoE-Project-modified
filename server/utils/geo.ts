/**
 * Geographic calculations and polyline projection utilities
 */

const EARTH_RADIUS_KM = 6371;

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Projects a point [lat, lng] onto line segments of a polyline,
 * not just the nearest vertex. Returns the closest projected point,
 * segment index, distance to projection in km, and overall route fraction (0..1).
 */
export function projectPointOntoPolylineSegments(
  pt: [number, number],
  polyline: [number, number][]
): {
  point: [number, number];
  distanceKm: number;
  fraction: number;
  segmentIndex: number;
} {
  if (polyline.length === 0) {
    return { point: pt, distanceKm: 0, fraction: 0, segmentIndex: 0 };
  }
  if (polyline.length === 1) {
    return {
      point: polyline[0],
      distanceKm: haversineDistanceKm(pt[0], pt[1], polyline[0][0], polyline[0][1]),
      fraction: 0,
      segmentIndex: 0,
    };
  }

  // Precompute segment lengths and cumulative distances
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const len = haversineDistanceKm(
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1]
    );
    segmentLengths.push(len);
    totalLength += len;
  }

  let minDistanceKm = Infinity;
  let bestPoint: [number, number] = polyline[0];
  let bestFraction = 0;
  let bestSegmentIndex = 0;

  let accumulatedDistance = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLen = segmentLengths[i];

    // Approximate flat projection for short segments
    const dx = b[1] - a[1];
    const dy = b[0] - a[0];
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 1e-12) {
      t = ((pt[1] - a[1]) * dx + (pt[0] - a[0]) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projectedLat = a[0] + t * dy;
    const projectedLng = a[1] + t * dx;
    const distToPt = haversineDistanceKm(pt[0], pt[1], projectedLat, projectedLng);

    if (distToPt < minDistanceKm) {
      minDistanceKm = distToPt;
      bestPoint = [projectedLat, projectedLng];
      bestSegmentIndex = i;

      const distAlongRoute = accumulatedDistance + t * segLen;
      bestFraction = totalLength > 0 ? Math.min(1, Math.max(0, distAlongRoute / totalLength)) : 0;
    }

    accumulatedDistance += segLen;
  }

  return {
    point: bestPoint,
    distanceKm: minDistanceKm,
    fraction: bestFraction,
    segmentIndex: bestSegmentIndex,
  };
}

/**
 * Interpolates a point along a polyline at a given distance fraction (0..1)
 */
export function interpolatePointAlongPolyline(
  polyline: [number, number][],
  fraction: number
): { lat: number; lng: number } {
  if (polyline.length === 0) return { lat: 0, lng: 0 };
  if (polyline.length === 1 || fraction <= 0) {
    return { lat: polyline[0][0], lng: polyline[0][1] };
  }
  if (fraction >= 1) {
    const last = polyline[polyline.length - 1];
    return { lat: last[0], lng: last[1] };
  }

  // Precompute cumulative distances
  const cumDists: number[] = [0];
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = haversineDistanceKm(
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1]
    );
    cumDists.push(cumDists[cumDists.length - 1] + d);
  }
  const totalDist = cumDists[cumDists.length - 1];
  if (totalDist === 0) return { lat: polyline[0][0], lng: polyline[0][1] };

  const targetDist = fraction * totalDist;

  for (let i = 0; i < cumDists.length - 1; i++) {
    if (targetDist <= cumDists[i + 1]) {
      const segLen = cumDists[i + 1] - cumDists[i];
      const t = segLen > 0 ? (targetDist - cumDists[i]) / segLen : 0;
      const a = polyline[i];
      const b = polyline[i + 1];
      return {
        lat: a[0] + t * (b[0] - a[0]),
        lng: a[1] + t * (b[1] - a[1]),
      };
    }
  }

  const last = polyline[polyline.length - 1];
  return { lat: last[0], lng: last[1] };
}

/**
 * Douglas-Peucker perpendicular distance
 */
function perpendicularDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): number {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  const t = Math.max(0, Math.min(1, ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / lenSq));
  const projLat = a[0] + t * dy;
  const projLng = a[1] + t * dx;
  return Math.hypot(p[0] - projLat, p[1] - projLng);
}

function douglasPeuckerRecursive(
  points: [number, number][],
  epsilon: number
): [number, number][] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeuckerRecursive(points.slice(0, index + 1), epsilon);
    const right = douglasPeuckerRecursive(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [start, end];
}

/**
 * Thins polyline points to at most maxPoints (default 800)
 */
export function thinPolyline(
  points: [number, number][],
  maxPoints = 800
): [number, number][] {
  if (points.length <= maxPoints) {
    return points;
  }

  // Iteratively adjust epsilon to get under maxPoints
  let low = 0.00001;
  let high = 0.05;
  let result = points;

  for (let iter = 0; iter < 10; iter++) {
    const mid = (low + high) / 2;
    const simplified = douglasPeuckerRecursive(points, mid);
    if (simplified.length <= maxPoints) {
      result = simplified;
      high = mid; // Try tighter tolerance
    } else {
      low = mid; // Need more simplification
    }
  }

  // Guarantee limit by uniform sampling if still slightly over
  if (result.length > maxPoints) {
    const step = (result.length - 1) / (maxPoints - 1);
    const sampled: [number, number][] = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      sampled.push(result[Math.floor(i * step)]);
    }
    sampled.push(result[result.length - 1]);
    return sampled;
  }

  return result;
}
