/**
 * Strict check for a 24-char hex ObjectId string. Deliberately not
 * `Types.ObjectId.isValid`, which (as of mongoose 8.16) still returns true
 * for plain numbers, e.g. isValid(123), letting a JSON body value that
 * isn't a string through. Guards route params / body ids so malformed input
 * 404s/400s instead of reaching a CastError.
 */
export function isValidObjectId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
}
