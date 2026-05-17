// Minimal geohash codec. Geohashes are base-32 strings encoding a
// rectangular bounding box; decode returns the center of that box.
// Reference: https://en.wikipedia.org/wiki/Geohash

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lng: number, precision = 9): string {
  let evenBit = true;
  let latLo = -90,  latHi = 90;
  let lngLo = -180, lngHi = 180;
  let bit = 0;
  let ch = 0;
  let out = "";
  while (out.length < precision) {
    if (evenBit) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) { ch = (ch << 1) | 1; lngLo = mid; } else { ch = ch << 1; lngHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; latLo = mid; } else { ch = ch << 1; latHi = mid; }
    }
    evenBit = !evenBit;
    bit++;
    if (bit === 5) {
      out += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return out;
}

export function decodeGeohash(hash: string): { lat: number; lng: number } | null {
  if (!hash) return null;
  const h = hash.toLowerCase();
  let evenBit = true;
  let latLo = -90,  latHi = 90;
  let lngLo = -180, lngHi = 180;

  for (const c of h) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) return null;
    for (let mask = 16; mask > 0; mask >>= 1) {
      if (evenBit) {
        const mid = (lngLo + lngHi) / 2;
        if (idx & mask) lngLo = mid; else lngHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (idx & mask) latLo = mid; else latHi = mid;
      }
      evenBit = !evenBit;
    }
  }
  return { lat: (latLo + latHi) / 2, lng: (lngLo + lngHi) / 2 };
}
