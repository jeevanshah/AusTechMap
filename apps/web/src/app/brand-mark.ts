const markPaths = `
  <path fill="#f97316" d="M18 13.5 36 31.5v15.1A36 36 0 0 0 18 75Z"/>
  <path fill="CURRENT" d="M21.5 10H58a26 26 0 0 1 26 26 26 26 0 0 1-26 26h-9a13 13 0 0 0-13 13v15H18V75a31 31 0 0 1 31-31h9a8 8 0 0 0 8-8 8 8 0 0 0-8-8H39.5Z"/>
  <path fill="#f97316" d="M54.5 66.8a31 31 0 0 0 19.7-4.4L91 90H68.5Z"/>
`;

function svgDataUri(current: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${markPaths.replace(
    "CURRENT",
    current,
  )}</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const roleWideMarkDataUri = svgDataUri("#0f172a");
export const roleWideInverseMarkDataUri = svgDataUri("#ffffff");
