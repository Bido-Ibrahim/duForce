
export const COLOR_SCALE_RANGE = ["#418BFC", "#46BCC8", "#D6AB1B", "#EB5E68", "#B6BE1C", "#F64D1A", "#BA6DE4", "#EA6BCB", "#B9AAC8", "#F08519"];

export const MESSAGES = {"noSP": "There is no shortest path between the selected nodes",
  "SP" : "Search for nodes to find the Shortest Path",
  "NN" : "Search for nodes to find the Nearest Neighbour",
}
export const TOOLTIP_KEYS = ['NAME',"DISPLAY NAME", "Parameter Explanation", "SUBMODULE_NAME", "SEGMENT_NAME"];

export const NODE_RADIUS_RANGE = [6, 18];

export const TICK_TIME = Math.ceil(Math.log(0.001) / Math.log(1 - 0.0228)); // numbers are d3 defaults for alphMin and alphaDecay
