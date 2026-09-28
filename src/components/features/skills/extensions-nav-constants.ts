/**
 * Shared by the desktop (`ExtensionsNavigation`) and mobile
 * (`ExtensionsMobileHub`) renderings of the same nav item list, so the two
 * surfaces cannot silently drift apart on which paths are cloud-linked/hidden
 * or how the cloud Skills URL is built.
 */

/** Only the Skills item points to a cloud-hosted page today. */
export const CLOUD_LINKED_EXTENSION_PATH = "/skills";
/** Plugins are not available on Cloud backends, so this item is hidden there. */
export const CLOUD_HIDDEN_EXTENSION_PATH = "/plugins";

/** Cloud-hosted Skills settings URL for a given Cloud backend host. */
export function buildCloudSkillsUrl(host: string): string {
  return `${host.replace(/\/+$/, "")}/settings/skills`;
}
