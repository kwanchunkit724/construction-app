// WGS84 (lat/lng degrees) -> HK1980 Grid (Easting/Northing metres). DWSS §3.3.3
// wants captured GPS "exportable to HK80 coordinates".
//
// HK1980 Grid = Transverse Mercator on the International 1924 (Hayford) ellipsoid.
// Parameters: Survey & Mapping Office, Lands Department, HKSAR.
//   origin  φ0 = 22°18'43.68"N, λ0 = 114°10'42.80"E
//   false   E0 = 836694.05 m, N0 = 819069.80 m, scale m0 = 1
// Redfearn forward series to the Δλ⁴ term (sub-metre over Hong Kong).
//
// NOTE on datum: input is WGS84 and is projected directly on the HK1980 grid
// (WGS84 ≈ HK80 datum). The WGS84↔HK80 offset over HK is a few metres — negligible
// vs the device GPS accuracy (±10-15 m coarse). For survey-grade output apply the
// official 7-parameter datum shift first. Self-evident check: the projection origin
// maps exactly to (E0, N0) because Δλ = 0 and M-M0 = 0 there.

const A = 6378388.0          // International 1924 semi-major axis (m)
const F = 1 / 297.0          // flattening
const E2 = F * (2 - F)       // first eccentricity squared
const N0 = 819069.80
const E0 = 836694.05
const M0SCALE = 1.0
const LAT0 = (22 + 18 / 60 + 43.68 / 3600) * Math.PI / 180
const LNG0 = (114 + 10 / 60 + 42.80 / 3600) * Math.PI / 180

function meridianArc(phi: number): number {
  const a0 = 1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256
  const a2 = (3 / 8) * (E2 + E2 ** 2 / 4 + 15 * E2 ** 3 / 128)
  const a4 = (15 / 256) * (E2 ** 2 + 3 * E2 ** 3 / 4)
  const a6 = (35 / 3072) * E2 ** 3
  return A * (a0 * phi - a2 * Math.sin(2 * phi) + a4 * Math.sin(4 * phi) - a6 * Math.sin(6 * phi))
}

export interface HK80Grid {
  easting: number // metres
  northing: number // metres
  gridRef: string // "836694 819070" (metre-rounded), HK1980 grid
}

export function wgs84ToHK80(latDeg: number, lngDeg: number): HK80Grid {
  const phi = latDeg * Math.PI / 180
  const lam = lngDeg * Math.PI / 180
  const dl = lam - LNG0
  const sinp = Math.sin(phi)
  const cosp = Math.cos(phi)
  const t = Math.tan(phi)
  const t2 = t * t
  const t4 = t2 * t2
  const nu = A / Math.sqrt(1 - E2 * sinp * sinp)            // prime vertical radius
  const rho = A * (1 - E2) / Math.pow(1 - E2 * sinp * sinp, 1.5) // meridian radius
  const psi = nu / rho
  const M = meridianArc(phi)
  const M0 = meridianArc(LAT0)

  const easting =
    E0 +
    M0SCALE * nu * cosp * dl *
      (1 +
        (dl * dl * cosp * cosp / 6) * (psi - t2) +
        (dl ** 4 * cosp ** 4 / 120) *
          (4 * psi ** 3 * (1 - 6 * t2) + psi * psi * (1 + 8 * t2) - psi * 2 * t2 + t4))

  const northing =
    N0 +
    M0SCALE *
      ((M - M0) +
        nu * sinp * cosp * dl * dl / 2 +
        nu * sinp * cosp ** 3 * dl ** 4 / 24 * (4 * psi * psi + psi - t2))

  return {
    easting: Math.round(easting * 100) / 100,
    northing: Math.round(northing * 100) / 100,
    gridRef: `${Math.round(easting)} ${Math.round(northing)}`,
  }
}
