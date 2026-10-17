// Bogongs per 100 moth photos.
// Areas with fewer than MIN_PHOTOS moth photos are too noisy to show.
export const MIN_PHOTOS = 30;

export const per100 = (bogong, moths) => (100 * bogong) / moths;
