const ALLOWED_AUTH_OPERATIONS = new Set([
  "GET:get-session",
  "POST:sign-in/email",
  "POST:sign-out",
]);

export function isAllowedAuthOperation(
  method: string,
  path: readonly string[],
): boolean {
  return ALLOWED_AUTH_OPERATIONS.has(
    `${method.toUpperCase()}:${path.join("/")}`,
  );
}
