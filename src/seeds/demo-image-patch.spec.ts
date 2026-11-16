import { missingDemoImagePatch } from './demo-image-patch';
describe('Demo image backfill', () => {
  const empty = {
    imageUrl: null,
    imageStorageKey: null,
    imageMimeType: null,
    imageSize: null,
  };
  it('adds a local image only to a question with no image metadata', () => {
    expect(missingDemoImagePatch(empty, 0, 1200)).toEqual({
      imageStorageKey: 'q1.png',
      imageUrl: '/uploads/questions/q1.png',
      imageMimeType: 'image/png',
      imageSize: 1200,
    });
  });
  it('preserves existing or partially associated images and missing source files', () => {
    expect(missingDemoImagePatch(empty, 0, null)).toBeNull();
    for (const fields of [
      { imageUrl: '/existing.png' },
      { imageStorageKey: 'existing.png' },
      { imageMimeType: 'image/png' },
      { imageSize: 500 },
    ])
      expect(
        missingDemoImagePatch({ ...empty, ...fields }, 0, 1200),
      ).toBeNull();
  });
});
