/** Shared colour utilities — used by renderer (BannerSVG) and main process (color-extractor). */

export interface HSL { h: number; s: number; l: number }

/**
 * Derive a full banner colour palette from a dominant HSL extracted from an owner avatar.
 * The bg is always near-white; primary/secondary are soft pastels that carry the hue
 * without darkening the card.
 */
export function deriveBannerPalette(dominant: HSL) {
  const { h, s } = dominant
  // Clamp saturation: low-saturation avatars (greyscale logos etc.) would otherwise
  // produce nearly-invisible elements; cap at 0.85 to avoid neon oversaturation.
  const sat = Math.min(Math.max(s, 0.35), 0.85)
  return {
    bg:             `hsl(${h}, ${Math.round(sat * 15)}%, 97%)`,
    gradientCenter: `hsl(${h}, ${Math.round(sat * 30)}%, 88%)`,
    primary:        `hsl(${h}, ${Math.round(sat * 40)}%, 72%)`,
    secondary:      `hsl(${h}, ${Math.round(sat * 35)}%, 80%)`,
  }
}
