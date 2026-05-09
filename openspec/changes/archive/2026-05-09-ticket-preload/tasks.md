## 1. Wire pre-load into workshop dashboard

- [x] 1.1 Import `usePreload` and `useNetInfo` (or use cache state alone) into `workshop/[id]/index.tsx`; destructure `preload`, `status` (as `preloadStatus`), and `errorMessage` (as `preloadError`)
- [x] 1.2 Extract the `cacheMetadata` read into a `loadCacheMetadata()` function and call it both on mount and after `preload()` resolves successfully
- [x] 1.3 Add the "Tải danh sách vé" button: disabled when `preloadStatus === "loading"`, shows `ActivityIndicator` while loading, shows `preloadError` below the button on failure
- [x] 1.4 Gate the "Mở máy quét QR" button: disabled when `localCache?.isFullyLoaded !== 1`; change button label to "Cần tải vé trước" when disabled so staff understands why
- [x] 1.5 Remove the "Quay về hàng đợi" button (redundant with tab bar)
