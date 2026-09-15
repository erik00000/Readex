export function calculatePdfDisplayScale({
  availableWidth,
  pageWidth,
  zoom,
  minimum = 0.15,
  maximum = 4
}: {
  availableWidth: number
  pageWidth: number
  zoom: number
  minimum?: number
  maximum?: number
}): number {
  if (
    !Number.isFinite(availableWidth) ||
    !Number.isFinite(pageWidth) ||
    availableWidth <= 0 ||
    pageWidth <= 0
  ) {
    return clamp(zoom, minimum, maximum)
  }
  const fitScale = availableWidth / pageWidth
  return clamp(fitScale * clamp(zoom, minimum, maximum), minimum, maximum)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
