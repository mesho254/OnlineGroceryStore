import bufferModule, { Buffer } from "node:buffer";

// Node.js 22+/25+ and Vercel's runtime remove deprecated `buffer.SlowBuffer`,
// which legacy transitive dependencies like `buffer-equal-constant-time` access on load.
if (!bufferModule.SlowBuffer) {
    bufferModule.SlowBuffer = Buffer;
}
if (typeof Buffer.SlowBuffer === "undefined") {
    Buffer.SlowBuffer = Buffer;
}
if (!Buffer.prototype.equal) {
    Buffer.prototype.equal = function equal(that) {
        if (!Buffer.isBuffer(that)) return false;
        return this.equals(that);
    };
}
