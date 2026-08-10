export function getOdooShBuildTone(result) {
  switch (String(result || "").toLocaleLowerCase()) {
    case "failed":
      return "failed";
    case "warning":
      return "warning";
    case "success":
      return "success";
    default:
      return "unknown";
  }
}
