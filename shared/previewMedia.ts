export function getPreviewSource(cloudUrl: string, localBlobUrl?: string) {
  return localBlobUrl || cloudUrl;
}

export function getVideoPlaybackErrorMessage(errorCode?: number | null) {
  if (errorCode === 4) {
    return "此影片編碼不受瀏覽器支援。請使用 H.264/AAC 的 MP4 或 WebM；雲端輸出仍可使用 FFmpeg 處理。";
  }
  return "預覽影片載入失敗。請重新播放；若問題持續，請重新上傳素材。";
}
