/**
 * Maps technology categories to static category icon asset paths.
 * Pure isomorphic function safe for both Server and Client Components.
 */
export function getCategoryIconPath(
  category: string | null | undefined,
): string | null {
  if (!category) return null;
  const lower = category.toLowerCase().trim();
  if (
    lower.includes("fintech") ||
    lower.includes("payment") ||
    lower.includes("bank") ||
    lower.includes("insurtech")
  ) {
    return "/assets/categories/fintech.png";
  }
  if (
    lower.includes("health") ||
    lower.includes("medtech") ||
    lower.includes("biotech")
  ) {
    return "/assets/categories/healthtech.png";
  }
  if (
    lower.includes("climate") ||
    lower.includes("renew") ||
    lower.includes("environ")
  ) {
    return "/assets/categories/climatetech.png";
  }
  if (
    lower.includes("energy") ||
    lower.includes("solar") ||
    lower.includes("wind") ||
    lower.includes("clean")
  ) {
    return "/assets/categories/clean_energy.png";
  }
  if (
    lower.includes("space") ||
    lower.includes("defence") ||
    lower.includes("defense") ||
    lower.includes("aerospace")
  ) {
    return "/assets/categories/space_defence.png";
  }
  if (
    lower.includes("govtech") ||
    lower.includes("government") ||
    lower.includes("civic")
  ) {
    return "/assets/categories/govtech.png";
  }
  if (
    lower.includes("ai") ||
    lower.includes("data") ||
    lower.includes("machine learning") ||
    lower.includes("ml")
  ) {
    return "/assets/categories/ai_data.png";
  }
  if (
    lower.includes("agtech") ||
    lower.includes("agri") ||
    lower.includes("farm")
  ) {
    return "/assets/categories/agtech.png";
  }
  if (
    lower.includes("saas") ||
    lower.includes("cloud") ||
    lower.includes("enterprise") ||
    lower.includes("devops") ||
    lower.includes("developer")
  ) {
    return "/assets/categories/saas.png";
  }
  if (
    lower.includes("deep") ||
    lower.includes("robot") ||
    lower.includes("iot") ||
    lower.includes("hardware")
  ) {
    return "/assets/categories/deeptech.png";
  }
  if (lower.includes("quantum")) {
    return "/assets/categories/quantum.png";
  }
  if (
    lower.includes("research") ||
    lower.includes("science") ||
    lower.includes("lab")
  ) {
    return "/assets/categories/research.png";
  }
  return null;
}
