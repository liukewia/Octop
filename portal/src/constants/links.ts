export const GITHUB_URL = "https://github.com/TencentCloud/Octop";
export const CHANGELOG_URL = "https://github.com/TencentCloud/Octop/blob/main/CHANGELOG.md";
export const DOCS_URL_EN = "https://octop.mintlify.site/introduction";
export const DOCS_URL_ZH = "https://octop.mintlify.site/zh/introduction";

/** Docs home for the active UI locale. */
export function docsUrl(locale: string): string {
  return locale.toLowerCase().startsWith("zh") ? DOCS_URL_ZH : DOCS_URL_EN;
}

export const FEEDBACK_URL =
  "https://doc.weixin.qq.com/smartsheet/form/1_wpkSFfCgAAIzkZ-F0ncReQFci0uBXXig_7b5534";
export const X_URL = "https://x.com/TencentCompute";
export const DISCORD_URL = "https://discord.gg/dMejevN6yp";

/** Desktop pet (OctopPet) installers — GitHub Releases. */
export const OCTOP_PET_RELEASES_URL = "https://github.com/jubaoliang/OctopPet/releases";
