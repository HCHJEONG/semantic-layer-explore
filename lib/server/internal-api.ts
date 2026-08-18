import "server-only";

export function getInternalApiUrl(path: string) {
  const configured = process.env.INTERNAL_API_ORIGIN?.trim();
  const origin = configured || `http://127.0.0.1:${process.env.PORT || "3000"}`;
  return new URL(path, origin);
}
