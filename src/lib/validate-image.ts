export type SniffedImageType = "image/png" | "image/jpeg" | "image/webp";

/**
 * Identify an image by its actual bytes ("magic numbers"), not by the
 * filename or the Content-Type the client claimed. A client can label any
 * file as image/png, so the declared type alone proves nothing.
 */
export function sniffImageType(buf: Buffer): SniffedImageType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
