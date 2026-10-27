# ekip-build: Ekip Panel merkezi derleyici

Bu repo Ekip Panel'in "Önizleme altyapısını kur" düğmesiyle kurulur ve güncellenir; elle düzenlemeyin.
Kaynağı Ekip Panel reposundaki `builder/` klasörüdür.

- `.github/workflows/build.yml`: panel bir push gördüğünde ya da "Test sayfasına al" denince tetiklenir.
  Kaynağı çeker, gizli anahtarsız işte derler / dönüştürür, ayrı işte siteye yazar, durumu panele bildirir.
- `.github/workflows/squash.yml`: haftada bir site repolarının geçmişini tek commit'e indirir.
- `scripts/`: tür tespiti, araç kurulumu, derleme, medya dönüştürme (Blender, FFmpeg, ImageMagick), yayın.
- `viewer/`: medya önizlemelerinin sayfası (görsel, video, ses, 3D, Lottie, Rive, PDF, HTML, gömülü bağlantılar).

Gizli anahtarlar: `SOURCE_TOKEN` (organizasyon token'ı), `PREVIEW_TOKEN` (önizleme organizasyonu token'ı),
`HOOK_SECRET` (panel geri çağrısı). Bu repoya yazma yetkisi yalnızca organizasyon yöneticilerinde olmalı.
