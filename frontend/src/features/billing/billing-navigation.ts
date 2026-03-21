export const navigateToUrl = (url: string) => {
  window.location.assign(url)
}

export const openInNewTab = (url: string) => {
  window.open(url, "_blank", "noopener,noreferrer")
}
