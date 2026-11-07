// A synthetic one-pixel PNG, never a user's Vibe or image.
export const pixelPNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=';
export const pngBytes=()=>Uint8Array.from(atob(pixelPNG),c=>c.charCodeAt(0));
