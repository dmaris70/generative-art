/*
 * model.js — what the building is, beneath what it looks like.
 *
 * A style draws a scene of faces, but a building is also its solids (every box
 * the scene recorded, with all six faces' worth of position), its structural
 * grid, its levels and its spaces. A style may report any of these through the
 * recorder on its context (`ctx.M`); the engine derives the rest from the
 * solids. The orthographic sheets (ortho.js) and the schedule read this model,
 * not the faces.
 *
 *   ctx.M.grid(xs, ys)        the structural grid lines, in plot coordinates
 *   ctx.M.space({ ... })      a room, court, void or circulation space
 */
(function (global) {
  'use strict';

  function create() {
    const m = { grids: [], spaces: [] };
    m.grid = function (xs, ys) { m.grids.push({ xs: xs.slice().sort((a, b) => a - b), ys: ys.slice().sort((a, b) => a - b) }); };
    m.space = function (sp) { m.spaces.push(sp); return sp; };
    return m;
  }

  global.Model = { create: create };
})(window);
