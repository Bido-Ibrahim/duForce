
export const COLOR_SCALE_RANGE = [
"#0072B2",
"#D55E00",
"#009E73",
"#CC79A7",
"#56B4E9",
"#F0E442",
"#999999",
"#E69F00",
"#64C4CD",
"#6A0DAD",
"#BADA55"]
export const MESSAGES = {"noSP": "There is no shortest path between the selected nodes",
  "SP" : "Search for nodes to find the Shortest Path",
  "NN" : "Search for nodes to find the Nearest Neighbour",
}
export const TOOLTIP_KEYS = ['NAME',"DISPLAY NAME", "Parameter Explanation", "SUBMODULE_NAME", "SEGMENT_NAME"];

export const NODE_RADIUS_RANGE = [6, 18];

export const TICK_TIME = Math.ceil(Math.log(0.001) / Math.log(1 - 0.0228)); // numbers are d3 defaults for alphMin and alphaDecay
