import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/api/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://x/pub' } })),
        createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://x/signed' }, error: null })),
        remove: vi.fn(async () => ({ error: null })),
      })),
    },
  },
}));

import {
  sniffImageMime,
  validatePhotoBytes,
  validatePhotoFile,
  buildPhotoPath,
  extensionForMime,
  extensionOfName,
  uploadPhoto,
  arePhotosSettled,
  publicPhotoUrl,
  signedPhotoUrl,
} from '@/lib/photoUpload';
import { PHOTO_LIMITS } from '@/lib/supportConfig';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

describe('определение типа по магическим байтам', () => {
  it('распознаёт JPEG / PNG / WebP', () => {
    expect(sniffImageMime(JPEG)).toBe('image/jpeg');
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(WEBP)).toBe('image/webp');
  });

  it('отклоняет GIF, текст и короткие последовательности', () => {
    expect(sniffImageMime(GIF)).toBeNull();
    expect(sniffImageMime(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMime(null)).toBeNull();
  });

  it('расширения по имени и MIME', () => {
    expect(extensionOfName('photo.JPG')).toBe('jpg');
    expect(extensionOfName('photo')).toBe('');
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/gif')).toBeNull();
  });
});

describe('validatePhotoBytes', () => {
  it('принимает валидный JPEG', () => {
    expect(validatePhotoBytes({ bytes: JPEG, size: 2048, name: 'a.jpg' })).toEqual({
      ok: true, mime: 'image/jpeg', error: null,
    });
  });

  it('отклоняет файл больше 5 МБ', () => {
    const res = validatePhotoBytes({ bytes: JPEG, size: PHOTO_LIMITS.maxSizeBytes + 1, name: 'a.jpg' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('too_big');
  });

  it('отклоняет пустой файл', () => {
    expect(validatePhotoBytes({ bytes: JPEG, size: 0, name: 'a.jpg' }).error).toBe('empty');
    expect(validatePhotoBytes({ bytes: JPEG, size: NaN, name: 'a.jpg' }).error).toBe('empty');
  });

  it('отклоняет не-картинку (например, html с расширением .jpg)', () => {
    const html = new Uint8Array(12).fill(0x3c);
    expect(validatePhotoBytes({ bytes: html, size: 100, name: 'x.jpg' }).error).toBe('bad_type');
  });

  it('отклоняет картинку с запрещённым расширением (.php/.exe)', () => {
    expect(validatePhotoBytes({ bytes: JPEG, size: 100, name: 'shell.php' }).error).toBe('bad_type');
    expect(validatePhotoBytes({ bytes: PNG, size: 100, name: 'img.webm' }).error).toBe('bad_type');
  });

  it('пропускает WebP с любым (допустимым) расширением', () => {
    expect(validatePhotoBytes({ bytes: WEBP, size: 500, name: 'p.webp' }).ok).toBe(true);
  });
});

describe('buildPhotoPath', () => {
  it('строит путь вида {userId}/{uuid}.{ext}', () => {
    const p = buildPhotoPath('user-1', 'image/jpeg');
    expect(p).toMatch(/^user-1\/.+\.jpg$/);
  });

  it('возвращает null без пользователя или для неподдерживаемого MIME', () => {
    expect(buildPhotoPath(null, 'image/jpeg')).toBeNull();
    expect(buildPhotoPath('u', 'image/gif')).toBeNull();
  });
});

describe('validatePhotoFile / uploadPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validatePhotoFile читает первые байты File', async () => {
    const file = new File([JPEG], 'photo.jpg', { type: 'image/jpeg' });
    const res = await validatePhotoFile(file);
    expect(res.ok).toBe(true);
    expect(res.mime).toBe('image/jpeg');
  });

  it('uploadPhoto грузит файл и возвращает путь в папке владельца', async () => {
    const { supabase } = await import('@/api/supabase');
    const file = new File([PNG], 'photo.png', { type: 'image/png' });
    const res = await uploadPhoto(file, 'support-photos', 'user-42');
    expect(res.path).toMatch(/^user-42\/.+\.png$/);
    expect(res.mime).toBe('image/png');
    expect(supabase.storage.from).toHaveBeenCalledWith('support-photos');
  });

  it('uploadPhoto не трогает Storage для невалидного файла', async () => {
    const { supabase } = await import('@/api/supabase');
    const file = new File([GIF], 'anim.gif', { type: 'image/gif' });
    await expect(uploadPhoto(file, 'support-photos', 'user-42')).rejects.toThrow();
    expect(supabase.storage.from).not.toHaveBeenCalled();
  });
});

describe('состояния списка фото', () => {
  it('отправка блокируется, пока фото грузятся или упали', () => {
    expect(arePhotosSettled([])).toBe(true);
    expect(arePhotosSettled([{ status: 'ready' }, { status: 'ready' }])).toBe(true);
    expect(arePhotosSettled([{ status: 'ready' }, { status: 'uploading' }])).toBe(false);
    expect(arePhotosSettled([{ status: 'error' }])).toBe(false);
  });
});

describe('URL для фото', () => {
  it('publicPhotoUrl — публичная ссылка сообщества', () => {
    expect(publicPhotoUrl('community-photos', 'u/1.jpg')).toBe('https://x/pub');
  });

  it('signedPhotoUrl — подписанная ссылка обращения', async () => {
    await expect(signedPhotoUrl('u/1.jpg')).resolves.toBe('https://x/signed');
  });
});
