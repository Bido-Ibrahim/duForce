
// various colour palettes for you to choose from
export const paletteJuly25 = [
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

export const observable11 = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc949", "#af7aa1", "#ff9da7", "#9c755f", "#bab0ab",
  "#17becf"
]
export const tableau11 = ['#4E79A7', '#F28E2C', '#E15759', '#76B7B2', '#59A14F', '#EDC949', '#AF7AA1', '#FF9D9A', '#9C755F', '#BAB0AB', '#17BECF']
export const gestalt = [
  "#005FCB",
  "#B190FF","#FDA600","#75BFFF","#DE2C62","#A4F9AC","#812AE7","#FF5B45","#007A72","#F76593","#FFC58F"

]

export const LINK_COLOR = "#C0C0C0";

// previous palette plus grey
// if you change the 1st 5 colours you'll also need to update .node:nth-child(1)-(5) in global.css (line 550-580)
export const COLOR_SCALE_RANGE = [
  "#418BFC",
  "#46BCC8",
  "#D6AB1B",
  "#EB5E68", "" +
  "#B6BE1C",
  "#F64D1A",
  "#BA6DE4",
  "#EA6BCB",
  "#B9AAC8",
  "#F08519",
  "#C0C0C0"
];

export const MESSAGES = {"noSP": "There is no shortest path between the selected nodes",
  "SP" : "Search for nodes to find the Shortest Path",
  "NN" : "Search for nodes to find the Nearest Neighbour",
}
export const TOOLTIP_KEYS = ['NAME',"DISPLAY NAME", "Parameter Explanation", "SUBMODULE_NAME", "SEGMENT_NAME"];

export const NODE_RADIUS_RANGE = [6, 18];

export const TICK_TIME = Math.ceil(Math.log(0.001) / Math.log(1 - 0.0228)); // numbers are d3 defaults for alphMin and alphaDecay
