(function(global) {
  /** A simple vector class */
  function vector(x, y) {
    return {
      get x() {
        return x;
      },
      get y() {
        return y;
      },
      magnitude() {
        return Math.sqrt(x * x + y * y);
      },
      normalize() {
        const magnitude = this.magnitude();
        return magnitude !== 0
          ? vector(x / magnitude, y / magnitude)
          : vector(0, 0);
      },
    };
  }
  global.vector = vector;
})(window);